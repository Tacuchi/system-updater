import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../app.js';
import { StatusPill } from '../components/status-pill.js';
import { colors, box } from '../theme.js';
import { t } from '../i18n/index.js';
import type { TableRow } from '../components/data-table.js';

export function PackageSync() {
  const { managers, startUpdate, startUninstall, setScreen, sudoMode } = useApp();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const ps = t('packageSync');

  const rows: TableRow[] = useMemo(() =>
    managers.flatMap(({ manager, outdated }) =>
      outdated.map(pkg => ({
        id: `${manager.manager.id}:${pkg.name}`,
        manager: manager.manager.id,
        package: pkg.name,
        currentVersion: pkg.currentVersion,
        newVersion: pkg.newVersion,
        size: pkg.size,
        requiresAdmin: manager.manager.requiresAdmin,
      }))
    ),
    [managers]
  );

  const totalUpdates = rows.length;
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === rows.length && rows.length > 0;

  function selectAll() {
    setSelectedIds(new Set(rows.map(r => r.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function groupSelectedByManager() {
    const toProcess = rows.filter(r => selectedIds.has(r.id));
    if (toProcess.length === 0) return null;
    const byManager = new Map<string, string[]>();
    for (const row of toProcess) {
      if (!byManager.has(row.manager)) byManager.set(row.manager, []);
      byManager.get(row.manager)!.push(row.package);
    }
    return byManager;
  }

  async function startSelected() {
    const byManager = groupSelectedByManager();
    if (!byManager) return;
    setScreen('active');
    for (const [managerId, packages] of byManager) {
      const ms = managers.find(m => m.manager.manager.id === managerId);
      if (ms) startUpdate(ms.manager.manager, packages, sudoMode);
    }
  }

  async function uninstallSelected() {
    const byManager = groupSelectedByManager();
    if (!byManager) return;
    setScreen('active');
    for (const [managerId, packages] of byManager) {
      const ms = managers.find(m => m.manager.manager.id === managerId);
      if (ms?.manager.manager.uninstall) {
        startUninstall(ms.manager.manager, packages, sudoMode);
      }
    }
  }

  useInput((input, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(rows.length - 1, c + 1));
    if (input === ' ') {
      const row = rows[cursor];
      if (row) toggleOne(row.id);
    }
    // Seleccionar/deseleccionar todos
    if (input === 'a' || input === 'A') selectAll();
    if (input === 'n' || input === 'N') deselectAll();
    // Iniciar actualización o desinstalación
    if ((input === 'u' || input === 'U') && selectedCount > 0) startSelected();
    if ((input === 'x' || input === 'X') && selectedCount > 0) uninstallSelected();
    if (key.return && selectedCount > 0) startSelected();
    // Volver
    if (key.escape) setScreen('dashboard');
  });

  if (totalUpdates === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={2} gap={1} alignItems="center" justifyContent="center" flexGrow={1}>
        <Text color={colors.tertiary} bold>{box.check} {ps.noUpdates}</Text>
        <Text color={colors.onSurfaceVariant} dimColor>ESC {box.arrow} Volver al panel</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box gap={2} alignItems="center">
          <Text bold color={colors.onSurface}>{ps.title}</Text>
          <Text color={colors.secondary} bold>{selectedCount}/{totalUpdates}</Text>
          {selectedCount > 0 && (
            <>
              <Text color={colors.onPrimary} backgroundColor={colors.primaryContainer} bold>
                {' '}U {box.arrow} ACTUALIZAR{' '}
              </Text>
              <Text color={colors.onError} backgroundColor={colors.errorContainer} bold>
                {' '}X {box.arrow} DESINSTALAR{' '}
              </Text>
            </>
          )}
        </Box>
        <Text color={colors.onSurfaceVariant} dimColor>
          [A] todos {box.dot} [N] ninguno {box.dot} [ESPACIO] toggle
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.outlineVariant}>
          {'  '}
          {padR(ps.colSel as string, 4)}
          {padR(ps.colManager as string, 10)}
          {padR(ps.colPackage as string, 20)}
          {padR(ps.colVersion as string, 12)}
          {padR(ps.colNew as string, 12)}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {rows.map((row, i) => {
          const isCursor = i === cursor;
          const isSelected = selectedIds.has(row.id);
          const bg = isCursor ? colors.surfaceContainerHigh : undefined;

          return (
            <Box key={row.id} backgroundColor={bg}>
              <Text color={isCursor ? colors.primary : colors.onSurfaceVariant}>
                {isCursor ? box.bullet : ' '}{' '}
              </Text>
              <Text color={isSelected ? colors.tertiary : colors.onSurfaceVariant}>
                {padR(isSelected ? '[x]' : '[ ]', 4)}
              </Text>
              <Text color={colors.onSurfaceVariant}>{padR(row.manager, 10)}</Text>
              <Text color={colors.onSurface} bold={isSelected}>{padR(row.package, 20)}</Text>
              <Text color={colors.onSurfaceVariant}>{padR(row.currentVersion, 12)}</Text>
              <Text color={colors.tertiary}>{padR(`${box.arrow} ${row.newVersion}`, 12)}</Text>
              {row.requiresAdmin && (
                <StatusPill variant="muted">ADM</StatusPill>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function padR(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}
