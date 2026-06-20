import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { semantic, colors } from '../theme.js';
import { selectionKey } from '../state/types.js';
import type { PackageItem } from '../state/types.js';
import { t, managerName } from '../i18n/index.js';

interface Row {
  managerId: string;
  pkg: PackageItem;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

  useSafeInput((input, key) => {
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
        <Box marginTop={1}>
          <Text color={semantic.muted}>R {t('flow', 'detecting')} · Q</Text>
        </Box>
      </Box>
    );
  }

  // Scrolling viewport: only render a window of rows around the cursor so a long
  // list never exceeds the terminal height (which makes Ink stack frames).
  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);
  const view = Math.max(6, (process.stdout.rows ?? 24) - 11);
  let start = clamped - Math.floor(view / 2);
  start = Math.max(0, Math.min(start, Math.max(0, rows.length - view)));
  const end = Math.min(rows.length, start + view);
  const visible = rows.slice(start, end);

  let prevManager = '';
  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.action} bold>
          {state.selection.size}
        </Text>
        <Text color={semantic.muted}>
          {' '}
          / {rows.length} {t('ui', 'selected')}
        </Text>
      </Box>

      {start > 0 && <Text color={colors.outline}>▲ {start} ↑</Text>}
      {visible.map(r => {
        const header = r.managerId !== prevManager ? managerName(r.managerId) : null;
        prevManager = r.managerId;
        const selected = state.selection.has(selectionKey(r.managerId, r.pkg.name));
        const isCursor = rows[clamped] === r;
        return (
          <Box key={`${r.managerId}:${r.pkg.name}`} flexDirection="column">
            {header && (
              <Text color={semantic.muted} bold>
                {header}
              </Text>
            )}
            <Box>
              <Text color={isCursor ? semantic.action : colors.outline}>{isCursor ? '❯ ' : '  '}</Text>
              <Text color={selected ? semantic.success : colors.outline}>{selected ? '[✓] ' : '[ ] '}</Text>
              <Box width={22}>
                <Text color={semantic.text} bold={isCursor}>
                  {clip(r.pkg.name, 21)}
                </Text>
              </Box>
              <Text color={semantic.muted} wrap="truncate-end">
                {clip(r.pkg.currentVersion, 14)} <Text color={semantic.action}>→</Text> {clip(r.pkg.newVersion, 14)}
              </Text>
            </Box>
          </Box>
        );
      })}
      {end < rows.length && <Text color={colors.outline}>▼ {rows.length - end} ↓</Text>}

      <Box marginTop={1}>
        <Text color={semantic.muted}>{clip(t('ui', 'selectHint'), width)}</Text>
      </Box>
    </Box>
  );
}
