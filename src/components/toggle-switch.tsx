import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface ToggleSwitchProps {
  value: boolean;
  label?: string;
  statusLabel?: string;
}

export function ToggleSwitch({ value, label, statusLabel }: ToggleSwitchProps) {
  return (
    <Box flexDirection="row" gap={2} alignItems="center">
      {label && (
        <Text color={colors.onSurface}>{label}</Text>
      )}
      {statusLabel && (
        <Text color={colors.onSurfaceVariant} dimColor>
          {statusLabel}
        </Text>
      )}
      <Text
        color={value ? colors.onTertiary : colors.onSurfaceVariant}
        backgroundColor={value ? colors.tertiary : colors.surfaceContainerHighest}
        bold
      >
        {value ? '[ ON ]' : '[OFF]'}
      </Text>
    </Box>
  );
}
