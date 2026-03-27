import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../app.js';
import { ToggleSwitch } from '../components/toggle-switch.js';
import { colors, box } from '../theme.js';
import { t } from '../i18n/index.js';
import { setLanguage } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';

type SettingsSection = 'general' | 'sources';

const SECTIONS: SettingsSection[] = ['general', 'sources'];
const LANGUAGES: Language[] = ['es', 'en'];

export function Settings() {
  const { managers, config, setConfig } = useApp();
  const s = t('settings');
  const [sectionIdx, setSectionIdx] = useState(0);
  const [managerCursor, setManagerCursor] = useState(0);
  const currentSection = SECTIONS[sectionIdx] ?? 'general';

  function toggleManager(id: string) {
    const current = config.enabledManagers[id] ?? true;
    setConfig({
      ...config,
      enabledManagers: { ...config.enabledManagers, [id]: !current },
    });
  }

  function cycleLanguage() {
    const idx = LANGUAGES.indexOf(config.language);
    const next = LANGUAGES[(idx + 1) % LANGUAGES.length] ?? 'es';
    setConfig({ ...config, language: next });
    setLanguage(next);
  }

  useInput((input, key) => {
    if (currentSection === 'sources') {
      if (key.upArrow) setManagerCursor(i => Math.max(0, i - 1));
      if (key.downArrow) setManagerCursor(i => Math.min(managers.length - 1, i + 1));
      if (input === ' ') {
        const mgr = managers[managerCursor];
        if (mgr) toggleManager(mgr.manager.manager.id);
      }
    }
    if (key.tab) setSectionIdx(i => (i + 1) % SECTIONS.length);
    if (input === 'l' || input === 'L') cycleLanguage();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color={colors.onSurface}>{s.title}</Text>
        <Text color={colors.outlineVariant} dimColor>{s.subtitle}</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1} gap={2}>
        <Box
          flexDirection="column"
          width={20}
          backgroundColor={colors.surfaceContainerLowest}
          paddingX={1}
          paddingY={1}
        >
          <Text color={colors.onSurfaceVariant} dimColor>NAVEGACIÓN</Text>
          {SECTIONS.map((section, i) => (
            <Box
              key={section}
              backgroundColor={i === sectionIdx ? colors.primaryContainer : undefined}
              paddingX={1}
            >
              <Text color={i === sectionIdx ? colors.onPrimaryContainer : colors.onSurface}>
                {String(i + 1).padStart(2, '0')} {s.nav[section as keyof typeof s.nav]}
              </Text>
            </Box>
          ))}

          <Box marginTop={2} flexDirection="column">
            <Text color={colors.outlineVariant} dimColor>● ESTADO</Text>
            <Text color={colors.onSurfaceVariant} dimColor>
              {s.statusSynced}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column" flexGrow={1} gap={2}>
          {currentSection === 'general' && (
            <Box flexDirection="column" gap={1}>
              <Text color={colors.primary} bold>{s.language}</Text>
              <Box flexDirection="row" gap={2} alignItems="center">
                <Text color={colors.onSurface}>Idioma / Language</Text>
                <Text
                  color={colors.onPrimaryContainer}
                  backgroundColor={colors.primaryContainer}
                  bold
                >
                  {' '}{config.language === 'es' ? 'Español' : 'English'}{' '}
                </Text>
                <Text color={colors.onSurfaceVariant} dimColor>
                  [L] cambiar
                </Text>
              </Box>
            </Box>
          )}

          {currentSection === 'sources' && (
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text color={colors.primary} bold>{s.activeManagers}</Text>
                <Text color={colors.onSurfaceVariant} dimColor>
                  [↑↓] navegar {box.dot} [ESPACIO] activar/desactivar
                </Text>
              </Box>
              {managers.map(({ manager }, i) => {
                const id = manager.manager.id;
                const enabled = config.enabledManagers[id] ?? true;
                const isCursor = i === managerCursor;
                const statusLabel = manager.detection.available ? s.detected : s.notFound;
                return (
                  <Box
                    key={id}
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                    backgroundColor={isCursor ? colors.surfaceContainerHigh : undefined}
                    paddingX={2}
                    paddingY={0}
                  >
                    <Box gap={2} alignItems="center">
                      <Text color={isCursor ? colors.primary : colors.onSurfaceVariant}>
                        {isCursor ? box.bullet : ' '}
                      </Text>
                      <Box flexDirection="column">
                        <Text color={enabled ? colors.onSurface : colors.onSurfaceVariant} bold={enabled} dimColor={!enabled}>
                          {t('managers', id as keyof ReturnType<typeof t<'managers'>>)}
                        </Text>
                        <Text color={colors.onSurfaceVariant} dimColor>
                          {manager.detection.version ?? 'N/A'}
                        </Text>
                      </Box>
                    </Box>
                    <Box flexDirection="row" gap={2} alignItems="center">
                      <Text
                        color={manager.detection.available ? colors.tertiary : colors.onSurfaceVariant}
                        dimColor={!manager.detection.available}
                      >
                        {statusLabel}
                      </Text>
                      <ToggleSwitch value={enabled} />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
