import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { semantic, colors } from '../theme.js';
import { selectionKey } from '../state/types.js';
import type { PackageItem } from '../state/types.js';
import { t, managerName } from '../i18n/index.js';

interface Row {
  managerId: string;
  pkg: PackageItem;
}

export function SelectScreen() {
  const { state, toggleItem, selectAll, selectNone, goConfirm, openSettings } = useMachine();
  const [cursor, setCursor] = useState(0);

  const rows: Row[] = [];
  for (const id of state.order) {
    const m = state.managers[id];
    if (m && m.status === 'outdated') for (const pkg of m.outdated) rows.push({ managerId: id, pkg });
  }
  const clamped = Math.min(cursor, Math.max(0, rows.length - 1));

  useInput((input, key) => {
    if (key.downArrow || input === 'j') setCursor(c => Math.min(rows.length - 1, c + 1));
    else if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1));
    else if (input === ' ') {
      const r = rows[clamped];
      if (r) toggleItem(selectionKey(r.managerId, r.pkg.name));
    } else if (input === 'a' || input === 'A') selectAll();
    else if (input === 'n' || input === 'N') selectNone();
    else if (key.return) goConfirm();
    else if (input === 's' || input === 'S') openSettings();
  });

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        <StepHeader phase={state.phase} />
        <Text color={semantic.success}>✓ {t('ui', 'noUpdates')}</Text>
      </Box>
    );
  }

  let lastManager = '';
  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.action} bold>
          {state.selection.size}
        </Text>
        <Text color={semantic.muted}> / {rows.length} {t('ui', 'selected')}</Text>
      </Box>
      {rows.map((r, i) => {
        const header = r.managerId !== lastManager ? managerName(r.managerId) : null;
        lastManager = r.managerId;
        const selected = state.selection.has(selectionKey(r.managerId, r.pkg.name));
        const isCursor = i === clamped;
        return (
          <Box key={`${r.managerId} ${r.pkg.name}`} flexDirection="column">
            {header && (
              <Text color={semantic.muted} bold>
                {header}
              </Text>
            )}
            <Box>
              <Text color={isCursor ? semantic.action : colors.outline}>{isCursor ? '❯ ' : '  '}</Text>
              <Text color={selected ? semantic.success : colors.outline}>{selected ? '[✓]' : '[ ]'} </Text>
              <Box width={22}>
                <Text color={semantic.text} bold={isCursor}>
                  {r.pkg.name}
                </Text>
              </Box>
              <Text color={semantic.muted}>
                {r.pkg.currentVersion} <Text color={semantic.action}>→</Text> {r.pkg.newVersion}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
