import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useScreenKeys, KeyHints } from './keys.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { isManagerEnabled } from '../lib/config.js';
import { t, managerName } from '../i18n/index.js';

export function SettingsScreen() {
  const { state, toggleEnabled, setLang, closeSettings, quitApp } = useMachine();
  const ids = state.order;
  const [cursor, setCursor] = useState(0);
  const clamped = Math.min(cursor, Math.max(0, ids.length - 1));

  const commands = useScreenKeys({ back: closeSettings,
    down: () => setCursor(c => Math.min(ids.length - 1, c + 1)), up: () => setCursor(c => Math.max(0, c - 1)),
    mark: () => { const id = ids[clamped]; if (id) toggleEnabled(id); },
    language: () => setLang(state.config.language === 'es' ? 'en' : 'es'), quit: quitApp });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={semantic.text}>{t('ui', 'language')}: </Text>
        <Text color={semantic.action} bold>
          {state.config.language.toUpperCase()}
        </Text>
        <Text color={semantic.muted}> (L)</Text>
      </Box>
      {ids.map((id, i) => {
        const enabled = isManagerEnabled(state.config, id);
        const isCursor = i === clamped;
        return (
          <Box key={id}>
            <Text color={isCursor ? semantic.action : colors.outline}>{isCursor ? `${g.cursor} ` : '  '}</Text>
            <Text color={enabled ? semantic.success : colors.outline}>{t('ui', enabled ? 'on' : 'off')} </Text>
            <Text color={enabled ? semantic.text : semantic.muted}>{managerName(id)}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <KeyHints commands={commands} />
      </Box>
    </Box>
  );
}
