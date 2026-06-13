import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { ManagerRow } from '../components/manager-row.js';
import { LogPane } from '../components/log-pane.js';
import { getLogEntries } from '../lib/logger.js';
import type { LogEntry } from '../lib/logger.js';
import { semantic } from '../theme.js';
import { t } from '../i18n/index.js';

export function UpdateScreen() {
  const { state, cancelRun } = useMachine();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Log tail refresh — scoped to this screen so it never re-renders the rest of
  // the tree (only mounts while updating). P4 isolates this further.
  useEffect(() => {
    const id = setInterval(() => setLogs(getLogEntries()), 250);
    return () => clearInterval(id);
  }, []);

  useInput((_input, key) => {
    if (key.escape) cancelRun();
  });

  const total = state.run.queue.length;
  const finished = state.run.doneCount + state.run.failedCount + state.run.skippedCount;

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.text} bold>
          {finished}/{total}{' '}
        </Text>
        <Text color={semantic.success}>✓{state.run.doneCount} </Text>
        <Text color={semantic.error}>✗{state.run.failedCount} </Text>
        <Text color={semantic.warning}>⊘{state.run.skippedCount}</Text>
      </Box>
      <Box>
        <Box flexDirection="column" width={42}>
          {state.run.queue.map(id => {
            const e = state.managers[id];
            return e ? <ManagerRow key={id} entry={e} showProgress /> : null;
          })}
        </Box>
        <LogPane entries={logs} width={56} maxLines={Math.max(6, state.run.queue.length + 2)} title="STDOUT" />
      </Box>
      <Box marginTop={1}>
        <Text color={semantic.muted}>{t('ui', 'updatingHint')}</Text>
      </Box>
    </Box>
  );
}
