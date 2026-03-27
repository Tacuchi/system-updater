import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface KeyHint {
  key: string;
  label: string;
  active?: boolean;
}

interface KeyHintBarProps {
  hints: KeyHint[];
}

export function KeyHintBar({ hints }: KeyHintBarProps) {
  return (
    <Box
      flexDirection="row"
      gap={1}
      backgroundColor={colors.surfaceContainerLow}
      paddingX={2}
      paddingY={0}
    >
      {hints.map((hint) => (
        <React.Fragment key={`${hint.key}-${hint.label}`}>
          <Box
            backgroundColor={hint.active ? colors.primaryContainer : colors.surfaceContainerHighest}
            paddingX={1}
          >
            <Text
              color={hint.active ? colors.onPrimaryContainer : colors.onSurface}
              bold={hint.active}
            >
              {hint.key}
            </Text>
          </Box>
          <Text color={colors.onSurfaceVariant}>{hint.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
