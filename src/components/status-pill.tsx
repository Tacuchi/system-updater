import React from 'react';
import { Text } from 'ink';
import { colors } from '../theme.js';

export type PillVariant = 'success' | 'error' | 'active' | 'warning' | 'muted' | 'info';

interface StatusPillProps {
  variant: PillVariant;
  children: React.ReactNode;
}

const pillStyles: Record<PillVariant, { color: string; bgColor?: string }> = {
  success: { color: colors.onTertiary, bgColor: colors.tertiary },
  error: { color: colors.onErrorContainer, bgColor: colors.errorContainer },
  active: { color: colors.onPrimaryContainer, bgColor: colors.primaryContainer },
  warning: { color: colors.onSecondaryContainer, bgColor: colors.secondaryContainer },
  muted: { color: colors.onSurfaceVariant, bgColor: colors.surfaceContainerHigh },
  info: { color: colors.primary, bgColor: colors.surfaceContainerHighest },
};

export function StatusPill({ variant, children }: StatusPillProps) {
  const style = pillStyles[variant];
  return (
    <Text color={style.color} backgroundColor={style.bgColor}>
      {' '}
      {children}
      {' '}
    </Text>
  );
}
