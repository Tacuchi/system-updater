import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../app.js';
import { StatusPill } from '../components/status-pill.js';
import { colors, box } from '../theme.js';
import { t } from '../i18n/index.js';

export function Dashboard() {
  const { managers, detecting, lastScan, rescan, systemInfo, setScreen } = useApp();
  const d = t('dashboard');

  useInput((input, key) => {
    if (input === 'r' || input === 'R') rescan();
    if (key.return) setScreen('packages');
  });

  const totalUpdates = managers.reduce((sum, m) => sum + m.outdated.length, 0);
  const isScanning = detecting || managers.some(m => m.scanning);

  function formatLastScan(date: Date | null): string {
    if (!date) return t('states', 'never') as string;
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return t('states', 'justNow') as string;
    return `${diffMin} min`;
  }

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box gap={2} alignItems="center">
          <StatusPill variant={isScanning ? 'active' : totalUpdates > 0 ? 'warning' : 'success'}>
            {isScanning ? d.scanning : totalUpdates > 0 ? `${totalUpdates} ${d.available}` : d.active}
          </StatusPill>
          <Text color={colors.onSurfaceVariant} dimColor>
            {d.uptime}: {systemInfo.uptime} {box.dot} {d.lastScan}: {formatLastScan(lastScan)}
          </Text>
        </Box>
        {!detecting && totalUpdates > 0 && (
          <Text color={colors.primaryContainer} backgroundColor={colors.primary} bold>
            {' '}ENTER {box.arrow} PAQUETES{' '}
          </Text>
        )}
      </Box>

      {detecting ? (
        <Box paddingY={1}>
          <Text color={colors.primary}>{d.scanning}</Text>
        </Box>
      ) : managers.length === 0 ? (
        <Box paddingY={1}>
          <Text color={colors.onSurfaceVariant}>{d.noManagers}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color={colors.outlineVariant}>
              {'  '}{padR('GESTOR', 18)}{padR('VER', 12)}{padR('UPD', 6)}{'ESTADO'}
            </Text>
          </Box>

          {managers.map(({ manager, outdated, scanning }) => {
            const id = manager.manager.id;
            const name = t('managers', id as keyof ReturnType<typeof t<'managers'>>) as string;
            const version = manager.detection.version ?? '—';
            const count = outdated.length;
            const isAdmin = manager.manager.requiresAdmin;

            return (
              <Box key={id} flexDirection="row">
                <Text color={colors.tertiary}>{count > 0 ? box.bullet : ' '} </Text>
                <Text color={colors.onSurface} bold={count > 0}>{padR(name, 18)}</Text>
                <Text color={colors.onSurfaceVariant}>{padR(version, 12)}</Text>
                <Text color={count > 0 ? colors.secondary : colors.onSurfaceVariant} bold={count > 0}>
                  {padR(scanning ? '..' : count > 0 ? String(count) : '—', 6)}
                </Text>
                {scanning ? (
                  <Text color={colors.primary}>{d.scanning}</Text>
                ) : isAdmin ? (
                  <Text color={colors.onSurfaceVariant} dimColor>ADMIN</Text>
                ) : count > 0 ? (
                  <StatusPill variant="warning">{count}</StatusPill>
                ) : (
                  <Text color={colors.tertiary}>{box.check}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {!detecting && managers.length > 0 && (
        <Box marginTop={1} gap={2}>
          <Text color={colors.onSurfaceVariant}>
            {managers.length} {box.dot}
          </Text>
          <Text color={totalUpdates > 0 ? colors.secondary : colors.tertiary} bold>
            {totalUpdates} actualizaciones
          </Text>
        </Box>
      )}
    </Box>
  );
}

function padR(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}
