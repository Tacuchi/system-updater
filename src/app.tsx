import React, { useEffect, useState } from 'react';
import { Box } from 'ink';
import { useAppMachine, MachineProvider, useMachine } from './hooks/use-app-machine.js';
import { DetectScreen } from './screens/detect.js';
import { SelectScreen } from './screens/select.js';
import { ConfirmScreen } from './screens/confirm.js';
import { UpdateScreen } from './screens/update.js';
import { SummaryScreen } from './screens/summary.js';
import { SettingsScreen } from './screens/settings-screen.js';
import { DetailScreen } from './screens/detail.js';
import { StepHeader } from './components/step-header.js';
import { LineOutput } from './components/line-output.js';

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
    case 'detail':
      return <DetailScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return null;
  }
}

function Shell() {
  // Ink redraws on resize without re-rendering React; the header and the list
  // viewports read the size at render time, so a resize re-renders them here.
  const [, setSize] = useState(0);
  useEffect(() => {
    const resized = () => setSize(size => size + 1);
    process.stdout.on('resize', resized);
    return () => { process.stdout.off('resize', resized); };
  }, []);
  return (
    <Box flexDirection="column" paddingX={1} width={Math.min(process.stdout.columns ?? 100, 100)}>
      <StepHeader />
      <PhaseRouter />
    </Box>
  );
}

export default function App({
  sudoMode = false,
  nonInteractive = false,
  lineOutput,
}: {
  sudoMode?: boolean;
  nonInteractive?: boolean;
  lineOutput?: (line: string) => void;
}) {
  const machine = useAppMachine(sudoMode, nonInteractive);
  return (
    <MachineProvider value={machine}>
      {lineOutput ? <LineOutput write={lineOutput} /> : <Shell />}
    </MachineProvider>
  );
}
