import React from 'react';
import { Box, Text } from 'ink';
import { colors, semantic } from '../theme.js';
import type { LogEntry } from '../lib/logger.js';

const levelColor: Record<LogEntry['level'], string> = {
  info: colors.onSurfaceVariant,
  debug: colors.outline,
  warn: semantic.warning,
  error: semantic.error,
  success: semantic.success,
};

interface Props {
  entries: LogEntry[];
  maxLines?: number;
  width?: number;
  title?: string;
}

/**
 * Live log tail. Isolated so the streaming output re-renders only this subtree
 * (see P4). Reads a bounded slice of entries — never the whole buffer.
 */
function LogPaneImpl({ entries, maxLines = 14, width = 60, title = 'LOG' }: Props) {
  const slice = entries.slice(-maxLines);
  const clip = Math.max(20, width - 2);
  return (
    <Box flexDirection="column" width={width}>
      <Text color={colors.outline}>┌ {title} {'─'.repeat(Math.max(0, clip - title.length - 2))}</Text>
      {slice.length === 0 ? (
        <Text color={colors.outline} dimColor>
          (sin actividad)
        </Text>
      ) : (
        slice.map(e => (
          <Text key={e.id} color={levelColor[e.level]} wrap="truncate-end">
            {e.message.slice(0, clip)}
          </Text>
        ))
      )}
    </Box>
  );
}

export const LogPane = React.memo(LogPaneImpl);
