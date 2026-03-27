import React from 'react';
import { Box, Text } from 'ink';
import { colors, box } from '../theme.js';

interface ProgressGaugeProps {
  value: number; // 0-100
  width?: number;
  color?: string;
  showPercent?: boolean;
  label?: string;
}

export function ProgressGauge({
  value,
  width = 20,
  color = colors.tertiary,
  showPercent = true,
  label,
}: ProgressGaugeProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const filled = Math.round((clampedValue / 100) * width);
  const empty = width - filled;

  const filledBar = box.blockFull.repeat(filled);
  const emptyBar = box.blockLight.repeat(empty);

  return (
    <Box flexDirection="row" gap={1} alignItems="center">
      {label && (
        <Text color={colors.onSurface} bold>
          {label}
        </Text>
      )}
      <Text color={color}>{filledBar}</Text>
      <Text color={colors.surfaceContainerHighest}>{emptyBar}</Text>
      {showPercent && (
        <Text color={colors.onSurfaceVariant}>
          {clampedValue.toFixed(0)}%
        </Text>
      )}
    </Box>
  );
}
