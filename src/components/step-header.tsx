import React from 'react';
import { Box, Text } from 'ink';
import { semantic, terminalTheme } from '../theme.js';
import { ASCII, g } from '../lib/glyphs.js';
import { t } from '../i18n/index.js';
import { useMachine } from '../hooks/use-app-machine.js';
import { getVersion } from '../lib/version.js';
import type { Phase } from '../state/types.js';
const steps: Partial<Record<Phase, number>> = { boot: 1, detecting: 1, scanning: 1, select: 2, confirm: 3, updating: 4 };
export function StepHeader() {
  const { state, selfUpdate } = useMachine();
  const width = Math.min(process.stdout.columns ?? 100, 100) - 2;
  const key = state.phase === 'boot' ? 'detecting' : state.phase;
  const label = t('flow', key);
  const step = steps[state.phase];
  let product = ` updater ${getVersion()}${selfUpdate ? ` ${g.arrow} ${selfUpdate.version}` : ''}`;
  let right = step ? `${t('flow', 'step')} ${step}/4 ${g.separator} ${label}` : label;
  if (8 + product.length + right.length + 1 > width) product = product.replace(' updater', '');
  if (8 + product.length + right.length + 1 > width && step) right = `${step}/4 ${g.separator} ${label}`;
  const available = width - 8 - product.length - 1;
  if (right.length > available) right = right.slice(0, Math.max(0, available - g.ellipsis.length)) + g.ellipsis;
  const gap = ' '.repeat(Math.max(1, width - 8 - product.length - right.length));
  const plainLogo = ASCII || process.env['NO_COLOR'] !== undefined;
  return <Box marginBottom={1}>
    <Text bold color={semantic.text}>tacuchi</Text>
    {plainLogo ? <Text>_</Text> : <Text color={terminalTheme === 'light' ? semantic.text : semantic.logoFill} backgroundColor={terminalTheme === 'light' ? semantic.logoFill : undefined}>{g.logo}</Text>}
    <Text color={semantic.muted}>{product}{gap}{right}</Text>
  </Box>;
}
