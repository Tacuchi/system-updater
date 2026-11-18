import React from 'react';
import { useScreenKeys, KeyHints } from './keys.js';
import { compactPath } from '../lib/display-path.js';
import { getLogFilePath } from '../lib/logger.js';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { StatusGlyph } from '../components/status-glyph.js';
import { semantic, colors } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { t, managerName } from '../i18n/index.js';

export function DetectScreen() {
  const { state, rescan, quitApp } = useMachine();
  const commands = useScreenKeys({ ...(state.error ? { retry: rescan } : {}), quit: quitApp });
  const scanning = state.phase === 'scanning';

  const done = state.order.filter(id => {
    const s = state.managers[id]?.status;
    // `unknown` is a settled outcome too: leaving it out kept the counter short
    // forever on any machine where a probe or a listing could not answer.
    return s === 'outdated' || s === 'uptodate' || s === 'unknown';
  }).length;

  if (state.error) return <Box flexDirection="column">
    <Text color={semantic.error}>{g.failed} {t('ui', 'detectionFailed')}</Text>
    <Text color={semantic.text}>{state.error}</Text>
    <Text color={semantic.muted}>{t('ui', 'logAt')} {compactPath(getLogFilePath() ?? '', Math.min(process.stdout.columns ?? 100, 100) - 4 - t('ui', 'logAt').length)}</Text>
    <KeyHints commands={commands} />
  </Box>;
  return (
    <Box flexDirection="column">
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
              ) : e.status === 'unknown' ? (
                <Text color={semantic.unknown}>{t('ui', 'undetermined')}</Text>
              ) : (
                <Text color={semantic.muted}>{g.ellipsis}</Text>
              )}
            </Box>
          );
        })}
      <KeyHints commands={commands} />
    </Box>
  );
}
