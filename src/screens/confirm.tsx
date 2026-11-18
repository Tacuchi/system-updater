import React from 'react';
import { Box, Text } from 'ink';
import { useMachine } from '../hooks/use-app-machine.js';
import { useScreenKeys, KeyHints } from './keys.js';
import { semantic } from '../theme.js';
import { g } from '../lib/glyphs.js';
import { parseSelectionKey } from '../state/types.js';
import { t, managerName } from '../i18n/index.js';

export function ConfirmScreen() {
  const { state, startRun, goSelect, sudoMode, relaunch, quitApp } = useMachine();

  // group selected package keys by manager id
  const byManager = new Map<string, number>();
  for (const key of state.selection) {
    const [id] = parseSelectionKey(key);
    byManager.set(id, (byManager.get(id) ?? 0) + 1);
  }

  // Windows: admin managers (choco) would be skipped without elevation. Offer a
  // one-UAC relaunch instead of forcing the user to restart the terminal as admin.
  const needsElevation =
    process.platform === 'win32' && !sudoMode && [...byManager.keys()].some(id => state.managers[id]?.requiresAdmin);

  const commands = useScreenKeys({ start: startRun, back: goSelect, ...(needsElevation ? { elevate: relaunch } : {}), quit: quitApp });

  const active = [...byManager.entries()].filter(([id]) => !state.managers[id]?.requiresAdmin || sudoMode);
  const skipped = [...byManager.entries()].filter(([id]) => state.managers[id]?.requiresAdmin && !sudoMode);
  return (
    <Box flexDirection="column">
      <Text color={semantic.text}>{t('ui', 'willRun')} {active.reduce((sum, [, count]) => sum + count, 0)} {t('ui', active.reduce((sum, [, count]) => sum + count, 0) === 1 ? 'packageOne' : 'packageMany')}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {active.map(([id, count]) => {
          return (
            <Box key={id}>
              <Text color={semantic.action}>{g.bullet} </Text>
              <Box width={20}>
                <Text color={semantic.text} bold>
                  {managerName(id)}
                </Text>
              </Box>
              <Text color={semantic.muted}>{count} {t('ui', count === 1 ? 'packageOne' : 'packageMany')}</Text>

            </Box>
          );
        })}
      </Box>
      {skipped.length > 0 && <Box flexDirection="column" marginBottom={1}>
        <Text color={semantic.warning}>{t('ui', process.platform === 'win32' ? 'adminManual' : 'sudoManual')}:</Text>
        {skipped.map(([id, count]) => <Text key={id} color={semantic.warning}>{g.skipped} {managerName(id)} {count} {t('ui', count === 1 ? 'packageOne' : 'packageMany')}</Text>)}
      </Box>}
      <KeyHints commands={commands} />
    </Box>
  );
}
