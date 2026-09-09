import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph, RunningGlyph, statusColor } from '../components/status-glyph.js';
import { semantic } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerEntry } from '../state/types.js';

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - g.ellipsis.length)) + g.ellipsis : s;
}

/** Formats a duration into the narrowest thing that is still unambiguous. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * How long the running manager has been running (DES-001@r1).
 *
 * It self-ticks for the same reason the spinner does: run state changes fire
 * once, on purpose, so nothing else would move this number. One second, not one
 * frame: it is a duration, not an animation. It lives in the row's SAME detail
 * slot as the percent and never both, so a row's width never depends on which
 * manager is running — 25 of the 27 report no percentage at all, which is why
 * that slot used to be empty for minutes at a time.
 */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatElapsed(now - startedAt)}</>;
}

/** ONE line per manager — constant height across running→done so the frame never
 * changes size (which is what made Ink stack frames). The live "action" is the
 * latest output line, driven by real progress events (no spinner timer). */
function Row({ e, width }: { e: ManagerEntry; width: number }) {
  let detail = '';
  if (e.status === 'running') detail = '';
  else if (e.status === 'skipped') detail = e.manualCommand ?? 'manual';
  else if (e.status === 'failed') detail = e.result?.failures[0]?.message ?? '';
  else if (e.status === 'unknown') detail = e.result?.failures[0]?.message ?? t('ui', 'undetermined');

  return (
    <Box>
      <Box width={2}>
        {e.status === 'running' ? <RunningGlyph /> : <StatusGlyph status={e.status} />}
      </Box>
      <Box width={16}>
        <Text color={semantic.text} bold={e.status === 'running'}>
          {clip(managerName(e.id), 15)}
        </Text>
      </Box>
      <Box width={13}>
        <Text color={statusColor(e.status)}>{t('status', e.status)}</Text>
      </Box>
      <Text color={semantic.muted}>
        {/* Percent when the manager reports one, elapsed time when it does not.
            Never both: the slot is one, and the row's width must not depend on
            which manager happens to be running. */}
        {e.status === 'running' ? (
          e.percent > 0 ? (
            `${e.percent}%`
          ) : e.startedAt !== undefined && e.startedAt > 0 ? (
            <Elapsed startedAt={e.startedAt} />
          ) : (
            ''
          )
        ) : (
          clip(detail, Math.max(0, width - 33))
        )}
      </Text>
    </Box>
  );
}

export function UpdateScreen() {
  const { state, cancelRun } = useMachine();

  useSafeInput((_input, key) => {
    if (key.escape) cancelRun();
  });

  const total = state.run.queue.length;
  const finished =
    state.run.doneCount + state.run.failedCount + state.run.skippedCount + state.run.unknownCount;
  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.text} bold>
          {finished}/{total}
          {'   '}
        </Text>
        <Text color={semantic.success}>
          {g.done} {state.run.doneCount}
          {'  '}
        </Text>
        <Text color={semantic.error}>
          {g.failed} {state.run.failedCount}
          {'  '}
        </Text>
        <Text color={semantic.warning}>
          {g.skipped} {state.run.skippedCount}
        </Text>
      </Box>

      {state.run.queue.map(id => {
        const e = state.managers[id];
        return e ? <Row key={id} e={e} width={width} /> : null;
      })}

      <Box marginTop={1} flexDirection="column">
        <Text color={semantic.muted}>{t('ui', 'updatingHint')}</Text>
        <Text color={semantic.muted}>{t('ui', 'passwordNote')}</Text>
      </Box>
    </Box>
  );
}
