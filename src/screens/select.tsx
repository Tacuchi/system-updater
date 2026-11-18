import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useScreenKeys, KeyHints } from './keys.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { selectionKey } from '../state/types.js';
import type { PackageItem } from '../state/types.js';
import { t, managerName } from '../i18n/index.js';
import { countText, selectionText } from '../lib/display-counts.js';

interface Row {
  managerId: string;
  pkg: PackageItem;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - g.ellipsis.length)) + g.ellipsis : s;
}

export function SelectScreen() {
  const { state, toggleItem, selectAll, selectNone, goConfirm, openSettings, rescan, quitApp } = useMachine();
  const [notice, setNotice] = useState(false);
  const [cursor, setCursor] = useState(0);

  const rows: Row[] = [];
  for (const id of state.order) {
    const m = state.managers[id];
    if (m && m.status === 'outdated') for (const pkg of m.outdated) rows.push({ managerId: id, pkg });
  }
  const clamped = Math.min(cursor, Math.max(0, rows.length - 1));
  // A manager whose state could not be determined contributes no rows, so
  // without this line the selection screen is exactly where it disappears —
  // and "nothing to choose from it" reads as "nothing to do".
  const undetermined = state.order.filter(id => state.managers[id]?.status === 'unknown');

  const commands = useScreenKeys({
    ...(rows.length > 0 ? {
      down: () => setCursor(c => Math.min(rows.length - 1, c + 1)),
      up: () => setCursor(c => Math.max(0, c - 1)),
      mark: () => { const row = rows[clamped]; if (row) toggleItem(selectionKey(row.managerId, row.pkg.name)); },
      all: selectAll, none: selectNone,
      next: () => { if (state.selection.size === 0) setNotice(true); else goConfirm(); },
    } : { retry: rescan }),
    settings: openSettings, quit: quitApp,
  });

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
          <Text color={semantic.success}>{g.done} {t('ui', 'noUpdates')}</Text>
        {undetermined.length > 0 && (
          <Text color={semantic.unknown}>
            {g.unknown} {countText(undetermined.length, 'unknown')}:{' '}
            {undetermined.map(id => managerName(id)).join(', ')}
          </Text>
        )}
        <Box marginTop={1}>
          <KeyHints commands={commands} />
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
      {notice && <Text color={semantic.warning}>{t('ui', 'chooseFirst')}</Text>}
      <Box marginBottom={1}>
        <Text color={semantic.action} bold>
          {selectionText(state.selection.size, rows.length)}
        </Text>
      </Box>

      {undetermined.length > 0 && (
        <Box marginBottom={1}>
          <Text color={semantic.unknown}>
            {g.unknown} {countText(undetermined.length, 'unknown')}:{' '}
            {undetermined.map(id => managerName(id)).join(', ')}
          </Text>
        </Box>
      )}
      {start > 0 && (
        <Text color={colors.outline}>
          {g.scrollUp} {start}
        </Text>
      )}
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
              <Text color={isCursor ? semantic.action : colors.outline}>{isCursor ? `${g.cursor} ` : '  '}</Text>
              <Text color={selected ? semantic.success : colors.outline}>
                {selected ? `${g.checkOn} ` : `${g.checkOff} `}
              </Text>
              <Box width={22}>
                <Text color={semantic.text} bold={isCursor}>
                  {clip(r.pkg.name, 21)}
                </Text>
              </Box>
              <Text color={semantic.muted} wrap="truncate-end">
                {clip(r.pkg.currentVersion, 14)} <Text color={semantic.action}>{g.arrow}</Text>{' '}
                {clip(r.pkg.newVersion, 14)}
              </Text>
            </Box>
          </Box>
        );
      })}
      {end < rows.length && (
        <Text color={colors.outline}>
          {g.scrollDown} {rows.length - end}
        </Text>
      )}

      <Box marginTop={1}>
        <KeyHints commands={commands} />
      </Box>
    </Box>
  );
}
