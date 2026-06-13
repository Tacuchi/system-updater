import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { semantic } from '../theme.js';
import { parseSelectionKey } from '../state/types.js';
import { t, managerName } from '../i18n/index.js';

export function ConfirmScreen() {
  const { state, startRun, goSelect, sudoMode } = useMachine();

  // group selected package keys by manager id
  const byManager = new Map<string, number>();
  for (const key of state.selection) {
    const [id] = parseSelectionKey(key);
    byManager.set(id, (byManager.get(id) ?? 0) + 1);
  }

  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') startRun();
    else if (key.escape) goSelect();
  });

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Text color={semantic.text}>{t('ui', 'willRun')}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {[...byManager.entries()].map(([id, count]) => {
          const m = state.managers[id];
          const willSkip = m?.requiresAdmin && !sudoMode;
          return (
            <Box key={id}>
              <Text color={semantic.action}>▸ </Text>
              <Box width={20}>
                <Text color={semantic.text} bold>
                  {managerName(id)}
                </Text>
              </Box>
              <Text color={semantic.muted}>{count} paquete(s)</Text>
              {willSkip && <Text color={semantic.warning}> · requiere sudo → manual</Text>}
            </Box>
          );
        })}
      </Box>
      <Text color={semantic.muted}>{t('ui', 'confirmHint')}</Text>
    </Box>
  );
}
