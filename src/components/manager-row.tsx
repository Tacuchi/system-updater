import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '@inkjs/ui';
import { semantic, colors } from '../theme.js';
import { StatusGlyph, statusColor } from './status-glyph.js';
import { t, managerName } from '../i18n/index.js';
import type { ManagerEntry } from '../state/types.js';

interface Props {
  entry: ManagerEntry;
  /** Number of selected packages in this manager (select screen). */
  selectedCount?: number;
  /** Show the live progress bar / current package (update screen). */
  showProgress?: boolean;
}

function ManagerRowImpl({ entry, selectedCount, showProgress }: Props) {
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={3}>
          <StatusGlyph status={entry.status} />
        </Box>
        <Box width={18}>
          <Text color={semantic.text} bold={entry.status === 'outdated' || entry.status === 'running'}>
            {managerName(entry.id)}
          </Text>
        </Box>
        <Box width={12}>
          <Text color={statusColor(entry.status)}>{t('status', entry.status)}</Text>
        </Box>
        {entry.status === 'outdated' && (
          <Text color={semantic.warning}>
            {entry.outdated.length}
            {selectedCount ? <Text color={semantic.action}> ({selectedCount} ✓)</Text> : null}
          </Text>
        )}
        {entry.requiresAdmin && (
          <Text color={semantic.muted}> ADMIN</Text>
        )}
      </Box>
      {showProgress && entry.status === 'running' && (
        <Box marginLeft={3}>
          <Box width={24}>
            {entry.percent > 0 ? (
              <ProgressBar value={entry.percent} />
            ) : (
              <Text color={colors.outline}>░░░░░░░░░░░░░░░░░░░░░░░░</Text>
            )}
          </Box>
          <Text color={semantic.muted}> {entry.currentPackage ?? ''}</Text>
        </Box>
      )}
    </Box>
  );
}

export const ManagerRow = React.memo(ManagerRowImpl);
