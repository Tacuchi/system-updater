import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error' | 'success';
  message: string;
}

const levelColors: Record<LogEntry['level'], string> = {
  info: colors.onSurface,
  debug: colors.onSurfaceVariant,
  warn: colors.secondary,
  error: colors.error,
  success: colors.tertiary,
};

interface LogStreamProps {
  entries: LogEntry[];
  maxLines?: number;
  title?: string;
}

export function LogStream({ entries, maxLines = 10, title }: LogStreamProps) {
  const visible = entries.slice(-maxLines);

  return (
    <Box flexDirection="column">
      {title && (
        <Text color={colors.outlineVariant} dimColor>
          ┌ {title} ┐
        </Text>
      )}
      <Box flexDirection="column" paddingLeft={title ? 1 : 0}>
        {visible.map(entry => (
          <Box key={entry.id} flexDirection="row" gap={1}>
            <Text color={colors.onSurfaceVariant} dimColor>
              {'>'}
            </Text>
            <Text color={levelColors[entry.level]}>{entry.message}</Text>
          </Box>
        ))}
        {visible.length === 0 && (
          <Text color={colors.onSurfaceVariant} dimColor>
            Sin entradas de log
          </Text>
        )}
      </Box>
    </Box>
  );
}
