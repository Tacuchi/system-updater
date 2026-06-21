import React from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StepHeader } from '../components/step-header.js';
import { StatusGlyph } from '../components/status-glyph.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';

export function DetectScreen() {
  const { state } = useMachine();
  const scanning = state.phase === 'scanning';

  const done = state.order.filter(id => {
    const s = state.managers[id]?.status;
    return s === 'outdated' || s === 'uptodate';
  }).length;

  return (
    <Box flexDirection="column">
      <StepHeader phase={state.phase} />
      <Box marginBottom={1}>
        <Text color={semantic.text}>
          {scanning ? t('ui', 'scanning') : t('ui', 'detecting')}
        </Text>
        {scanning && (
          <Text color={semantic.muted}>
            {' '}
            ({done}/{state.order.length})
          </Text>
        )}
      </Box>
      {scanning &&
        state.order.map(id => {
          const e = state.managers[id];
          if (!e) return null;
          return (
            <Box key={id}>
              <Box width={2}>
                <StatusGlyph status={e.status} />
              </Box>
              <Box width={18}>
                <Text color={e.status === 'outdated' ? semantic.text : semantic.muted}>{managerName(id)}</Text>
              </Box>
              {e.status === 'outdated' ? (
                <Text color={semantic.warning}>
                  {e.outdated.length} {g.outdated}
                </Text>
              ) : e.status === 'uptodate' ? (
                <Text color={colors.outline}>-</Text>
              ) : (
                <Text color={semantic.muted}>{g.ellipsis}</Text>
              )}
            </Box>
          );
        })}
    </Box>
  );
}
