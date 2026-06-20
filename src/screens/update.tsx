import React from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph, statusColor } from '../components/status-glyph.js';
import { semantic } from '../theme.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerEntry } from '../state/types.js';

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

/** ONE line per manager — constant height across running→done so the frame never
 * changes size (which is what made Ink stack frames). The live "action" is the
 * latest output line, driven by real progress events (no spinner timer). */
function Row({ e, width }: { e: ManagerEntry; width: number }) {
  let detail = '';
  if (e.status === 'running') detail = e.percent > 0 ? `${e.percent}%` : '';
  else if (e.status === 'skipped') detail = e.manualCommand ?? 'manual';
  else if (e.status === 'failed') detail = e.result?.failures[0]?.message ?? '';

  return (
    <Box>
      <Box width={2}>
        <StatusGlyph status={e.status} />
      </Box>
      <Box width={16}>
        <Text color={semantic.text} bold={e.status === 'running'}>
          {clip(managerName(e.id), 15)}
        </Text>
      </Box>
      <Box width={13}>
        <Text color={statusColor(e.status)}>{t('status', e.status)}</Text>
      </Box>
      <Text color={semantic.muted}>{clip(detail, Math.max(0, width - 33))}</Text>
    </Box>
  );
}

export function UpdateScreen() {
  const { state, cancelRun } = useMachine();

  useSafeInput((_input, key) => {
    if (key.escape) cancelRun();
  });

  const total = state.run.queue.length;
  const finished = state.run.doneCount + state.run.failedCount + state.run.skippedCount;
  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.text} bold>
          {finished}/{total}
          {'   '}
        </Text>
        <Text color={semantic.success}>✓ {state.run.doneCount}  </Text>
        <Text color={semantic.error}>✗ {state.run.failedCount}  </Text>
        <Text color={semantic.warning}>⊘ {state.run.skippedCount}</Text>
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
