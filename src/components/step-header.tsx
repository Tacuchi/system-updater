import React from 'react';
import { Box, Text } from 'ink';
import { semantic } from '../theme.js';
import { t } from '../i18n/index.js';
import type { Phase } from '../state/types.js';

// The 4 visible steps of the linear flow (settings is an overlay, summary is terminal).
const STEP: Partial<Record<Phase, { n: number; key: 'detecting' | 'scanning' | 'select' | 'confirm' | 'updating' }>> = {
  detecting: { n: 1, key: 'detecting' },
  scanning: { n: 1, key: 'scanning' },
  select: { n: 2, key: 'select' },
  confirm: { n: 3, key: 'confirm' },
  updating: { n: 4, key: 'updating' },
};

export function StepHeader({ phase }: { phase: Phase }) {
  if (phase === 'summary') {
    return (
      <Box marginBottom={1}>
        <Text color={semantic.success} bold>
          ▆ {t('flow', 'summary')}
        </Text>
      </Box>
    );
  }
  if (phase === 'settings') {
    return (
      <Box marginBottom={1}>
        <Text color={semantic.action} bold>
          ▆ {t('flow', 'settings')}
        </Text>
      </Box>
    );
  }
  const step = STEP[phase];
  if (!step) return null;

  return (
    <Box marginBottom={1}>
      {[1, 2, 3, 4].map(i => (
        <Text key={i} color={i === step.n ? semantic.action : semantic.muted} bold={i === step.n}>
          {i === step.n ? '▆' : '▁'}{' '}
        </Text>
      ))}
      <Text color={semantic.muted}>
        {'  '}
        {t('flow', 'step')} {step.n}/4 ·{' '}
      </Text>
      <Text color={semantic.action} bold>
        {t('flow', step.key)}
      </Text>
    </Box>
  );
}
