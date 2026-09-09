import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine, summarizeRun } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph } from '../components/status-glyph.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';
import type { PackageOutcome } from '../managers/types.js';
import type { ManagerStatus } from '../state/types.js';

/**
 * What changed, package by package (DES-001@r1).
 *
 * The Summary could only ever show a version delta when EXACTLY one package had
 * moved, so a brew run of twenty-one packages showed the number 21 and nothing
 * else. This is that answer, on its own screen: a screen swap grows no region,
 * while a list that grew inside the Summary would have needed its height capped
 * by hand — and frame stacking already cost this product its spinner once.
 */

/** One package's outcome maps onto the row-glyph vocabulary the product already has. */
function glyphStatus(outcome: PackageOutcome): ManagerStatus {
  switch (outcome) {
    case 'upgraded':
      return 'done';
    case 'failed':
      return 'failed';
    case 'unknown':
      return 'unknown';
    case 'skipped':
      return 'skipped';
    default:
      return 'uptodate';
  }
}

function delta(from: string | undefined, to: string | undefined): string {
  if (!from && !to) return '';
  if (!from) return `${g.arrow} ${to}`;
  if (!to) return from;
  return `${from} ${g.arrow} ${to}`;
}

interface Row {
  kind: 'manager' | 'package';
  managerId: string;
  name?: string;
  outcome?: PackageOutcome;
  right?: string;
}

export function DetailScreen() {
  const { state, closeDetail } = useMachine();
  const [offset, setOffset] = useState(0);

  const summary = summarizeRun(state);
  const rows: Row[] = [];
  for (const m of summary.managers) {
    const packages = m.packages ?? [];
    if (packages.length === 0) continue;
    rows.push({ kind: 'manager', managerId: m.id });
    for (const p of packages) {
      rows.push({
        kind: 'package',
        managerId: m.id,
        name: p.name,
        outcome: p.outcome,
        right: delta(p.fromVersion, p.toVersion),
      });
    }
  }

  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);
  // Same viewport discipline as the selection list: render a window, never a list
  // taller than the terminal, so twenty packages cannot overflow the frame.
  const view = Math.max(6, (process.stdout.rows ?? 24) - 11);
  const maxOffset = Math.max(0, rows.length - view);
  const start = Math.min(offset, maxOffset);
  const visible = rows.slice(start, start + view);
  const nameWidth = Math.max(12, Math.min(32, width - 26));

  // The same key opens and closes it — the journey is summary → detail → summary
  // and nothing else. The arrows only MOVE the window: scrolling a read-only
  // list is still a reading, and without it the tail of a long list would be
  // unreachable, which defeats the screen.
  useSafeInput((input, key) => {
    if (input === 'd' || input === 'D') closeDetail();
    else if (key.downArrow || input === 'j') setOffset(o => Math.min(maxOffset, o + 1));
    else if (key.upArrow || input === 'k') setOffset(o => Math.max(0, o - 1));
  });

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      {/* Both indicators are ALWAYS a line, blank when there is nothing on that
          side: making them conditional changed the frame's height by up to two
          rows as the reader scrolled, which is the stacking this screen exists
          to avoid. */}
      <Text color={colors.outline}>{start > 0 ? `${g.scrollUp} ${start}` : ' '}</Text>
      {rows.length === 0 ? (
        <Text color={semantic.muted}>{t('ui', 'noChanges')}</Text>
      ) : (
        visible.map((r, i) =>
          r.kind === 'manager' ? (
            <Text key={`m:${r.managerId}:${i}`} color={semantic.muted} bold>
              {managerName(r.managerId)}
            </Text>
          ) : (
            <Box key={`p:${r.managerId}:${r.name}:${i}`}>
              <Box width={2}>
                <StatusGlyph status={glyphStatus(r.outcome ?? 'unchanged')} />
              </Box>
              <Box width={nameWidth}>
                <Text color={semantic.text} wrap="truncate-end">
                  {r.name}
                </Text>
              </Box>
              {/* Right-aligned so the deltas line up down the column even when the
                  names above them have wildly different lengths. */}
              <Box flexGrow={1} justifyContent="flex-end">
                <Text color={semantic.muted} wrap="truncate-end">
                  {r.right}
                </Text>
              </Box>
            </Box>
          ),
        )
      )}
      <Text color={colors.outline}>
        {start + visible.length < rows.length ? `${g.scrollDown} ${rows.length - start - visible.length}` : ' '}
      </Text>
      <Box marginTop={1}>
        <Text color={semantic.muted}>{t('ui', 'detailBack')}</Text>
      </Box>
    </Box>
  );
}
