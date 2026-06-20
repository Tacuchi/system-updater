import React from 'react';
import { Box, Text, useApp as useInkApp } from 'ink';
import { useAppMachine, MachineProvider, useMachine } from './hooks/use-app-machine.js';
import { useSafeInput } from './hooks/use-safe-input.js';
import { DetectScreen } from './screens/detect.js';
import { SelectScreen } from './screens/select.js';
import { ConfirmScreen } from './screens/confirm.js';
import { UpdateScreen } from './screens/update.js';
import { SummaryScreen } from './screens/summary.js';
import { SettingsScreen } from './screens/settings-screen.js';
import { semantic, colors } from './theme.js';

function Header({ sudoMode }: { sudoMode: boolean }) {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Text color={semantic.action} bold>
        @tacuchi/updater
      </Text>
      <Text color={sudoMode ? semantic.warning : colors.outline}>{sudoMode ? 'SUDO' : `${process.platform}`}</Text>
    </Box>
  );
}

function PhaseRouter() {
  const { state } = useMachine();
  switch (state.phase) {
    case 'boot':
    case 'detecting':
    case 'scanning':
      return <DetectScreen />;
    case 'select':
      return <SelectScreen />;
    case 'confirm':
      return <ConfirmScreen />;
    case 'updating':
      return <UpdateScreen />;
    case 'summary':
      return <SummaryScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return null;
  }
}

function Shell({ sudoMode }: { sudoMode: boolean }) {
  const { exit } = useInkApp();
  // Global quit only. Phase-specific keys live in each screen so handlers never
  // collide (only the active screen is mounted).
  useSafeInput((input) => {
    if (input === 'q' || input === 'Q') {
      exit();
      process.exit(0);
    }
  });
  return (
    <Box flexDirection="column" paddingX={1} width={Math.min(process.stdout.columns ?? 100, 100)}>
      <Header sudoMode={sudoMode} />
      <PhaseRouter />
    </Box>
  );
}

export default function App({
  sudoMode = false,
  nonInteractive = false,
}: {
  sudoMode?: boolean;
  nonInteractive?: boolean;
}) {
  const machine = useAppMachine(sudoMode, nonInteractive);
  return (
    <MachineProvider value={machine}>
      <Shell sudoMode={sudoMode} />
    </MachineProvider>
  );
}
