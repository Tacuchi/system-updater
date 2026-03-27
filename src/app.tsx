import React, { createContext, useContext, useState, useEffect } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { NavBar } from './components/nav-bar.js';
import { KeyHintBar } from './components/key-hint-bar.js';
import { Dashboard } from './screens/dashboard.js';
import { ActiveUpdates } from './screens/active-updates.js';
import { PackageSync } from './screens/package-sync.js';
import { Settings } from './screens/settings.js';
import { useManagers } from './hooks/use-managers.js';
import { useUpdates } from './hooks/use-updates.js';
import { useSystemInfo } from './hooks/use-system-info.js';
import { loadConfig, saveConfig } from './lib/config.js';
import { initLogger, getLogEntries } from './lib/logger.js';
import { setLanguage } from './i18n/index.js';
import type { UserConfig } from './lib/config.js';
import type { ManagerState } from './hooks/use-managers.js';
import type { UpdateProgress } from './hooks/use-updates.js';
import type { PackageManager } from './managers/types.js';
import type { SystemInfo } from './lib/platform.js';
import type { LogEntry } from './components/log-stream.js';
import { colors } from './theme.js';

export type Screen = 'dashboard' | 'packages' | 'active' | 'settings';

interface AppContextValue {
  screen: Screen;
  setScreen: (s: Screen) => void;
  managers: ManagerState[];
  detecting: boolean;
  lastScan: Date | null;
  rescan: () => void;
  updates: Map<string, UpdateProgress>;
  startUpdate: (manager: PackageManager, packages?: string[], sudoMode?: boolean) => Promise<void>;
  clearUpdate: (id: string) => void;
  systemInfo: SystemInfo;
  config: UserConfig;
  setConfig: (c: UserConfig) => void;
  logs: LogEntry[];
  terminalWidth: number;
  terminalHeight: number;
  sudoMode: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside App');
  return ctx;
}

export default function App({ sudoMode = false }: { sudoMode?: boolean }) {
  const { stdout } = useStdout();
  const [terminalWidth, setTerminalWidth] = useState(stdout?.columns ?? 120);
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows ?? 40);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [config, setConfigState] = useState<UserConfig>(loadConfig);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  // Inicializar logger una vez
  useEffect(() => {
    initLogger();
    setLanguage(config.language);
  }, []);

  // Actualizar idioma cuando cambia config
  useEffect(() => {
    setLanguage(config.language);
  }, [config.language]);

  // Escuchar cambios de tamaño de terminal
  useEffect(() => {
    const onResize = () => {
      setTerminalWidth(stdout?.columns ?? 120);
      setTerminalHeight(stdout?.rows ?? 40);
    };
    stdout?.on('resize', onResize);
    return () => { stdout?.off('resize', onResize); };
  }, [stdout]);

  // Refrescar log entries periódicamente
  useEffect(() => {
    const id = setInterval(() => {
      setLogEntries(getLogEntries());
    }, 500);
    return () => clearInterval(id);
  }, []);

  const { managers, detecting, lastScan, rescan } = useManagers(config);
  const { updates, startUpdate, clearUpdate } = useUpdates();
  const systemInfo = useSystemInfo();

  function setConfig(c: UserConfig) {
    setConfigState(c);
    saveConfig(c);
  }

  // Teclas globales
  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      process.exit(0);
    }
  });

  const osInfo = `OS: ${systemInfo.os.toUpperCase().replace(' ', '_')} / ${systemInfo.hostname.toUpperCase()}`;

  const ctx: AppContextValue = {
    screen,
    setScreen,
    managers,
    detecting,
    lastScan,
    rescan,
    updates,
    startUpdate,
    clearUpdate,
    systemInfo,
    config,
    setConfig,
    logs: logEntries,
    terminalWidth,
    terminalHeight,
    sudoMode,
  };

  const screenHints: Record<Screen, Array<{ key: string; label: string; active?: boolean }>> = {
    dashboard: [
      { key: 'Q', label: 'SALIR' },
      { key: 'TAB', label: 'SIGUIENTE' },
      { key: 'R', label: 'ESCANEAR' },
      { key: 'ENTER', label: 'VER PAQUETES', active: true },
    ],
    packages: [
      { key: 'Q', label: 'SALIR' },
      { key: 'A', label: 'TODOS' },
      { key: 'N', label: 'NINGUNO' },
      { key: 'U', label: 'ACTUALIZAR', active: true },
      { key: 'ESC', label: 'VOLVER' },
    ],
    active: [
      { key: 'Q', label: 'SALIR' },
      { key: 'TAB', label: 'SIGUIENTE' },
      { key: 'R', label: 'RE-ESCANEAR' },
      { key: 'D', label: 'DETALLE', active: true },
      { key: 'ESC', label: 'VOLVER' },
    ],
    settings: [
      { key: 'Q', label: 'SALIR' },
      { key: 'TAB', label: 'SECCIÓN' },
      { key: 'SPACE', label: 'TOGGLE', active: true },
      { key: 'L', label: 'IDIOMA' },
      { key: 'ESC', label: 'VOLVER' },
    ],
  };

  return (
    <AppContext.Provider value={ctx}>
      <Box
        flexDirection="column"
        width={terminalWidth}
        height={terminalHeight}
        backgroundColor={colors.surface}
      >
        <NavBar
          currentScreen={screen}
          onNavigate={setScreen}
          osInfo={osInfo}
          sudoMode={sudoMode}
        />

        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {screen === 'dashboard' && <Dashboard />}
          {screen === 'packages' && <PackageSync />}
          {screen === 'active' && <ActiveUpdates />}
          {screen === 'settings' && <Settings />}
        </Box>

        <KeyHintBar hints={screenHints[screen]} />
      </Box>
    </AppContext.Provider>
  );
}
