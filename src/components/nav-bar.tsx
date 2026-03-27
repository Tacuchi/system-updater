import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import { t } from '../i18n/index.js';
import type { Screen } from '../app.js';

interface NavBarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  osInfo?: string;
  sudoMode?: boolean;
}

const screens: Array<{ id: Screen; labelKey: string }> = [
  { id: 'dashboard', labelKey: 'dashboard' },
  { id: 'packages', labelKey: 'packages' },
  { id: 'settings', labelKey: 'settings' },
];

export function NavBar({ currentScreen, onNavigate, osInfo, sudoMode }: NavBarProps) {
  const nav = t('nav');

  useInput((input, key) => {
    if (key.tab) {
      const idx = screens.findIndex(s => s.id === currentScreen);
      const next = screens[(idx + 1) % screens.length];
      if (next) onNavigate(next.id);
    }
    if (input === '1') onNavigate('dashboard');
    if (input === '2') onNavigate('packages');
    if (input === '3') onNavigate('settings');
  });

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      backgroundColor={colors.surfaceContainerLow}
      paddingX={2}
      paddingY={0}
    >
      {/* Logo */}
      <Box gap={2} alignItems="center">
        <Text color={colors.primary} bold>
          {nav.title}
        </Text>
        <Text color={colors.outlineVariant}>│</Text>
        {screens.map(s => {
          const label = nav[s.labelKey as keyof typeof nav];
          return (
            <Text
              key={s.id}
              color={currentScreen === s.id ? colors.tertiary : colors.onSurfaceVariant}
              bold={currentScreen === s.id}
            >
              {typeof label === 'string' ? label : s.id.toUpperCase()}
            </Text>
          );
        })}
      </Box>

      {/* Derecha: OS info + versión */}
      <Box gap={2} alignItems="center">
        {sudoMode && (
          <Text color={colors.onPrimary} backgroundColor={colors.error} bold>
            {' '}SUDO{' '}
          </Text>
        )}
        {osInfo && (
          <Text color={colors.onSurfaceVariant} dimColor>
            {osInfo}
          </Text>
        )}
        <Text color={colors.primary}>{nav.version}</Text>
      </Box>
    </Box>
  );
}
