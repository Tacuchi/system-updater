import React from 'react';
import { Box, Text } from 'ink';
import { colors, box } from '../theme.js';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  accent?: string;
  width?: number;
}

export function StatCard({ label, value, unit, accent = colors.primary, width = 20 }: StatCardProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.outlineVariant}
      paddingX={2}
      paddingY={1}
      width={width}
    >
      <Text color={colors.onSurfaceVariant} dimColor>
        {label}
      </Text>
      <Box flexDirection="row" alignItems="flex-end" gap={1}>
        <Text color={accent} bold>
          {typeof value === 'number'
            ? value.toLocaleString()
            : value}
        </Text>
        {unit && (
          <Text color={colors.onSurfaceVariant} dimColor>
            {unit}
          </Text>
        )}
      </Box>
    </Box>
  );
}

interface ManagerCardProps {
  name: string;
  description: string;
  updateCount: number;
  status: 'available' | 'inactive' | 'updating' | 'error';
  version?: string;
  width?: number;
}

const statusColors: Record<ManagerCardProps['status'], string> = {
  available: colors.tertiary,
  inactive: colors.onSurfaceVariant,
  updating: colors.primary,
  error: colors.error,
};

export function ManagerCard({ name, description, updateCount, status, version, width = 28 }: ManagerCardProps) {
  const statusColor = statusColors[status];

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.outlineVariant}
      paddingX={2}
      paddingY={1}
      width={width}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={colors.onSurface} bold>
          {name}
        </Text>
        <Text color={statusColor} dimColor={status === 'inactive'}>
          {box.dot}
        </Text>
      </Box>
      <Text color={colors.onSurfaceVariant} dimColor>
        {description}
      </Text>
      <Box marginTop={1} flexDirection="row" alignItems="baseline" gap={1}>
        <Text color={statusColor} bold>
          {updateCount}
        </Text>
        <Text color={colors.onSurfaceVariant} dimColor>
          ACTUALIZACIONES
        </Text>
      </Box>
      {version && (
        <Box marginTop={1} flexDirection="row" justifyContent="space-between">
          <Text color={colors.outlineVariant} dimColor>
            {version}
          </Text>
        </Box>
      )}
    </Box>
  );
}
