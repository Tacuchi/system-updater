import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph, statusColor } from '../components/status-glyph.js';
import { getLogEntries } from '../lib/logger.js';
import type { LogEntry } from '../lib/logger.js';
import { semantic, colors } from '../theme.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerEntry } from '../state/types.js';

const levelColor: Record<LogEntry['level'], string> = {
  info: colors.onSurfaceVariant,
  debug: colors.outline,
  warn: semantic.warning,
  error: semantic.error,
  success: semantic.success,
};

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** ONE line per manager — height stays constant across running→done transitions. */
function UpdateRow({ e, width }: { e: ManagerEntry; width: number }) {
  const detail =
    e.status === 'running'
      ? `${e.percent > 0 ? `${e.percent}% ` : ''}${e.currentPackage ?? ''}`
      : e.status === 'skipped'
        ? 'manual'
        : '';
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
  const [logs, setLogs] = useState<LogEntry[]>(getLogEntries);

  // Log tail refresh, scoped to this screen (only mounts while updating).
  useEffect(() => {
    const id = setInterval(() => setLogs(getLogEntries()), 300);
    return () => clearInterval(id);
  }, []);

  useInput((_input, key) => {
    if (key.escape) cancelRun();
  });

  const total = state.run.queue.length;
  const finished = state.run.doneCount + state.run.failedCount + state.run.skippedCount;
  const width = Math.min((process.stdout.columns ?? 90) - 4, 92);

  // FIXED-height log window (pad to a constant N) so the frame never grows/shrinks
  // between renders — that growth is what makes Ink stack frames on small terminals.
  const LOG_LINES = 6;
  const tail = logs.slice(-LOG_LINES);
  const pad = LOG_LINES - tail.length;

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.text} bold>
          {finished}/{total}{' '}
        </Text>
        <Text color={semantic.success}>OK {state.run.doneCount} </Text>
        <Text color={semantic.error}>ERR {state.run.failedCount} </Text>
        <Text color={semantic.warning}>MAN {state.run.skippedCount}</Text>
      </Box>

      {state.run.queue.map(id => {
        const e = state.managers[id];
        return e ? <UpdateRow key={id} e={e} width={width} /> : null;
      })}

      <Box marginTop={1}>
        <Text color={colors.outline}>{'─'.repeat(Math.min(width, 60))} STDOUT</Text>
      </Box>
      {tail.map(e => (
        <Text key={e.id} color={levelColor[e.level]} wrap="truncate-end">
          {clip(e.message, width)}
        </Text>
      ))}
      {Array.from({ length: Math.max(0, pad) }, (_, i) => (
        <Text key={`pad-${i}`}> </Text>
      ))}

      <Box marginTop={1}>
        <Text color={semantic.muted}>{t('ui', 'updatingHint')}</Text>
      </Box>
    </Box>
  );
}
