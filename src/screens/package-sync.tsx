import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useApp } from '../app.js';
import { StatusPill } from '../components/status-pill.js';
import { colors, box } from '../theme.js';
import { t } from '../i18n/index.js';
import type { TableRow } from '../components/data-table.js';

export function PackageSync() {
  const { managers, startUpdate, setScreen, sudoMode } = useApp();
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

  async function startSelected() {
    const toUpdate = rows.filter(r => selectedIds.has(r.id));
    if (toUpdate.length === 0) return;

    const byManager = new Map<string, string[]>();
    for (const row of toUpdate) {
      if (!byManager.has(row.manager)) byManager.set(row.manager, []);
      byManager.get(row.manager)!.push(row.package);
    }

    setScreen('active');
    for (const [managerId, packages] of byManager) {
      const ms = managers.find(m => m.manager.manager.id === managerId);
      if (ms) startUpdate(ms.manager.manager, packages, sudoMode);
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
    // Iniciar actualización
    if ((input === 'u' || input === 'U') && selectedCount > 0) startSelected();
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
    <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <Box gap={2} alignItems="center">
          <Text bold color={colors.onSurface}>{ps.title}</Text>
          <Text color={colors.onSurfaceVariant}>
            {totalUpdates} {ps.eligible}
          </Text>
        </Box>
        <Box gap={2} alignItems="center">
          <Text color={colors.secondary} bold>
            {selectedCount}/{totalUpdates} seleccionados
          </Text>
          {selectedCount > 0 && (
            <Text color={colors.onPrimary} backgroundColor={colors.primaryContainer} bold>
              {' '}U → ACTUALIZAR{' '}
            </Text>
          )}
        </Box>
      </Box>

      {/* Acciones rápidas */}
      <Box gap={3} marginBottom={1}>
        <Text color={allSelected ? colors.onSurfaceVariant : colors.primary}>
          [A] Seleccionar todos
        </Text>
        <Text color={selectedCount === 0 ? colors.onSurfaceVariant : colors.primary}>
          [N] Deseleccionar
        </Text>
        <Text color={colors.onSurfaceVariant} dimColor>
          [ESPACIO] Toggle {box.dot} [↑↓] Navegar
        </Text>
      </Box>

      {/* Encabezados de tabla */}
      <Box>
        <Text color={colors.outlineVariant} bold>
          {'  '}
          {padR(ps.colSel as string, 5)}
          {padR(ps.colManager as string, 12)}
          {padR(ps.colPackage as string, 22)}
          {padR(ps.colVersion as string, 14)}
          {padR(ps.colNew as string, 14)}
        </Text>
      </Box>
      <Text color={colors.outlineVariant} dimColor>
        {'  '}{'─'.repeat(70)}
      </Text>

      {/* Filas */}
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
                {padR(isSelected ? '[x]' : '[ ]', 5)}
              </Text>
              <Text color={colors.onSurfaceVariant}>
                {padR(row.manager, 12)}
              </Text>
              <Text color={colors.onSurface} bold={isSelected}>
                {padR(row.package, 22)}
              </Text>
              <Text color={colors.onSurfaceVariant}>
                {padR(row.currentVersion, 14)}
              </Text>
              <Text color={colors.tertiary}>
                {padR(`${box.arrow} ${row.newVersion}`, 14)}
              </Text>
              {row.requiresAdmin && (
                <StatusPill variant="muted">ADMIN</StatusPill>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Barra de confirmación */}
      <Box marginTop={1} flexDirection="row" justifyContent="center">
        <Box
          borderStyle="single"
          borderColor={selectedCount > 0 ? colors.tertiary : colors.outlineVariant}
          paddingX={2}
        >
          <Text color={selectedCount > 0 ? colors.tertiary : colors.onSurfaceVariant}>
            {selectedCount > 0
              ? `${box.bullet} ${selectedCount} seleccionados — [U] o [ENTER] para actualizar`
              : `${box.bullet} Selecciona paquetes con [ESPACIO] o [A] para todos`}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function padR(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}
