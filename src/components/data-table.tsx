import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, box } from '../theme.js';

export interface TableRow {
  id: string;
  manager: string;
  package: string;
  currentVersion: string;
  newVersion: string;
  size?: string;
  requiresAdmin?: boolean;
}

interface DataTableProps {
  rows: TableRow[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onConfirm?: () => void;
  active?: boolean;
}

const COL_WIDTHS = {
  sel: 5,
  manager: 10,
  package: 22,
  version: 14,
  newVersion: 14,
  size: 10,
};

function pad(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}

function TableHeader() {
  return (
    <Box flexDirection="row" borderStyle="single" borderColor={colors.outlineVariant}>
      <Text color={colors.onSurfaceVariant} bold>
        {pad('SEL', COL_WIDTHS.sel)}
        {pad('GESTOR', COL_WIDTHS.manager)}
        {pad('PAQUETE', COL_WIDTHS.package)}
        {pad('VERSION', COL_WIDTHS.version)}
        {pad('NUEVA', COL_WIDTHS.newVersion)}
        {pad('TAMAÑO', COL_WIDTHS.size)}
      </Text>
    </Box>
  );
}

export function DataTable({ rows, selectedIds, onToggle, onConfirm, active = true }: DataTableProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (!active) return;
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(rows.length - 1, c + 1));
    if (input === ' ') {
      const row = rows[cursor];
      if (row) onToggle(row.id);
    }
    if (input === 'a' || input === 'A') {
      rows.forEach(r => {
        if (!selectedIds.has(r.id)) onToggle(r.id);
      });
    }
    if (input === 'n' || input === 'N') {
      rows.forEach(r => {
        if (selectedIds.has(r.id)) onToggle(r.id);
      });
    }
    if ((input === 'u' || input === 'U') && onConfirm) onConfirm();
  });

  if (rows.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingY={1}>
        <TableHeader />
        <Text color={colors.onSurfaceVariant} dimColor>
          El sistema está actualizado
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <TableHeader />
      {rows.map((row, i) => {
        const isCursor = active && i === cursor;
        const isSelected = selectedIds.has(row.id);
        const bg = isCursor ? colors.surfaceContainerHigh : undefined;

        return (
          <Box key={row.id} flexDirection="row" backgroundColor={bg}>
            <Text color={isSelected ? colors.tertiary : colors.onSurfaceVariant}>
              {pad(isSelected ? '[x]' : '[ ]', COL_WIDTHS.sel)}
            </Text>
            <Text color={isCursor ? colors.primary : colors.onSurface}>
              {pad(row.manager, COL_WIDTHS.manager)}
            </Text>
            <Text color={isCursor ? colors.onSurface : colors.onSurface} bold={isSelected}>
              {pad(row.package, COL_WIDTHS.package)}
            </Text>
            <Text color={colors.onSurfaceVariant}>
              {pad(row.currentVersion, COL_WIDTHS.version)}
            </Text>
            <Text color={colors.tertiary}>
              {pad(`${box.arrow} ${row.newVersion}`, COL_WIDTHS.newVersion)}
            </Text>
            <Text color={colors.onSurfaceVariant} dimColor>
              {pad(row.size ?? 'N/A', COL_WIDTHS.size)}
            </Text>
            {row.requiresAdmin && (
              <Text color={colors.secondary} dimColor>
                {' '}ADMIN
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
