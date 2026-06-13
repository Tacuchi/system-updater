import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { ManagerRow } from '../components/manager-row.js';
import { semantic } from '../theme.js';
import { t } from '../i18n/index.js';

export function DetectScreen() {
  const { state } = useMachine();
  const scanning = state.phase === 'scanning';

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Spinner />
        <Text color={semantic.text}> {scanning ? t('ui', 'scanning') : t('ui', 'detecting')}</Text>
      </Box>
      {scanning && (
        <Box flexDirection="column">
          {state.order.map(id => {
            const e = state.managers[id];
            return e ? <ManagerRow key={id} entry={e} /> : null;
          })}
        </Box>
      )}
    </Box>
  );
}
