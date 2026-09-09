import React from 'react';
import { Box, Text } from 'ink';
import { useAppMachine, MachineProvider, useMachine } from './hooks/use-app-machine.js';
import { useSafeInput } from './hooks/use-safe-input.js';
import { DetectScreen } from './screens/detect.js';
import { SelectScreen } from './screens/select.js';
import { ConfirmScreen } from './screens/confirm.js';
import { UpdateScreen } from './screens/update.js';
import { SummaryScreen } from './screens/summary.js';
import { SettingsScreen } from './screens/settings-screen.js';
import { getVersion } from './lib/version.js';
import { semantic, colors } from './theme.js';

function Header({ sudoMode }: { sudoMode: boolean }) {
  const { selfUpdate } = useMachine();
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Box>
        <Text color={semantic.action} bold>
          @tacuchi/updater
        </Text>
        <Text color={colors.outline}> v{getVersion()}</Text>
        {/* On the same line on purpose: the notice must not add a region to a
            frame whose stability is an invariant of the update screen. */}
        {selfUpdate ? (
          // `warning`, NOT `unknown`: el ámbar está reservado a «no se pudo
          // determinar» (DES-001@r1) y reusarlo acá lo vuelve a significar dos cosas.
          <Text color={semantic.warning}>
            {' '}
            → v{selfUpdate.version} · {selfUpdate.howTo}
          </Text>
        ) : null}
      </Box>
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
  const { quitApp } = useMachine();
  // Global quit only. Phase-specific keys live in each screen so handlers never
  // collide (only the active screen is mounted). The route itself lives in the
  // machine: leaving has to abort the run and close the log, not just exit.
  useSafeInput((input) => {
    if (input === 'q' || input === 'Q') quitApp();
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
