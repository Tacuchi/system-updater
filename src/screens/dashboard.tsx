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
    <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
      {/* Header compacto */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Box gap={2} alignItems="center">
          <Text bold color={colors.onSurface}>{d.title}</Text>
          <StatusPill variant={isScanning ? 'active' : totalUpdates > 0 ? 'warning' : 'success'}>
            {isScanning ? d.scanning : totalUpdates > 0 ? `${totalUpdates} ${d.available}` : d.active}
          </StatusPill>
        </Box>
        <Text color={colors.onSurfaceVariant} dimColor>
          {systemInfo.os} {box.dot} {d.uptime}: {systemInfo.uptime} {box.dot} {d.lastScan}: {formatLastScan(lastScan)}
        </Text>
      </Box>

      {/* Lista de gestores — directo al punto */}
      {detecting ? (
        <Box paddingY={1}>
          <Text color={colors.primary}>{d.scanning}</Text>
        </Box>
      ) : managers.length === 0 ? (
        <Box paddingY={1}>
          <Text color={colors.onSurfaceVariant}>{d.noManagers}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={0}>
          {/* Encabezado de tabla */}
          <Box paddingBottom={1} borderBottom={false}>
            <Text color={colors.outlineVariant}>
              {'  '}
              {padR('GESTOR', 20)}
              {padR('VERSION', 16)}
              {padR('ACTUALIZACIONES', 18)}
              {'ESTADO'}
            </Text>
          </Box>
          <Text color={colors.outlineVariant} dimColor>
            {'  '}{'─'.repeat(70)}
          </Text>

          {managers.map(({ manager, outdated, scanning }) => {
            const id = manager.manager.id;
            const name = t('managers', id as keyof ReturnType<typeof t<'managers'>>) as string;
            const version = manager.detection.version ?? '—';
            const count = outdated.length;
            const isAdmin = manager.manager.requiresAdmin;

            return (
              <Box key={id} flexDirection="row" paddingY={0}>
                <Text color={colors.tertiary}>{count > 0 ? box.bullet : ' '} </Text>
                <Text color={colors.onSurface} bold={count > 0}>
                  {padR(name, 20)}
                </Text>
                <Text color={colors.onSurfaceVariant}>
                  {padR(version, 16)}
                </Text>
                <Text color={count > 0 ? colors.secondary : colors.onSurfaceVariant} bold={count > 0}>
                  {padR(
                    scanning ? '...' : count > 0 ? String(count) : '—',
                    18
                  )}
                </Text>
                {scanning ? (
                  <Text color={colors.primary}>{d.scanning}</Text>
                ) : isAdmin ? (
                  <Text color={colors.onSurfaceVariant} dimColor>ADMIN</Text>
                ) : count > 0 ? (
                  <StatusPill variant="warning">{count} disponibles</StatusPill>
                ) : (
                  <StatusPill variant="success">{box.check}</StatusPill>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Resumen + acción directa */}
      {!detecting && managers.length > 0 && (
        <Box flexDirection="column" marginTop={2} gap={1}>
          <Text color={colors.outlineVariant} dimColor>
            {'─'.repeat(70)}
          </Text>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center">
            <Box gap={2}>
              <Text color={colors.onSurface}>
                {managers.length} gestores {box.dot}{' '}
              </Text>
              <Text color={totalUpdates > 0 ? colors.secondary : colors.tertiary} bold>
                {totalUpdates} actualizaciones
              </Text>
            </Box>
            {totalUpdates > 0 && (
              <Text color={colors.primaryContainer} backgroundColor={colors.primary} bold>
                {' '}ENTER → VER PAQUETES{' '}
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function padR(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}
