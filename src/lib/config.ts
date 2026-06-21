import fs from 'fs';
import path from 'path';
import os from 'os';
import envPaths from 'env-paths';
import type { Language } from '../i18n/index.js';

export type Verbosity = 'debug' | 'info' | 'warn' | 'error';

export interface ManagerConfig {
  enabled?: boolean;
  timeoutMs?: number;
}

export interface UserConfig {
  enabledManagers: Record<string, boolean>;
  verbosity: Verbosity;
  language: Language;
  /** Max managers upgraded concurrently (non-admin lane). Clamped to 1..8. */
  concurrency: number;
  /** Per-manager upgrade timeout override, keyed by manager id. */
  timeoutsMs: Record<string, number>;
  /** Max bytes of stdout/stderr kept per command for logs/diagnosis. */
  logTailBytes: number;
  /** Per-manager settings (enable/disable, timeout). */
  managers: Record<string, ManagerConfig>;
}

const DEFAULTS: UserConfig = {
  enabledManagers: {},
  verbosity: 'info',
  language: 'es',
  concurrency: 4,
  timeoutsMs: {},
  logTailBytes: 16384,
  managers: {},
};

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 8;

function clampConcurrency(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULTS.concurrency;
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.round(n)));
}

/** Merge a partial (possibly user-edited) config over defaults and clamp values. */
export function normalizeConfig(parsed: Partial<UserConfig>): UserConfig {
  return {
    ...DEFAULTS,
    ...parsed,
    enabledManagers: { ...DEFAULTS.enabledManagers, ...parsed.enabledManagers },
    timeoutsMs: { ...DEFAULTS.timeoutsMs, ...parsed.timeoutsMs },
    managers: { ...DEFAULTS.managers, ...parsed.managers },
    concurrency: clampConcurrency(parsed.concurrency),
    logTailBytes:
      typeof parsed.logTailBytes === 'number' && parsed.logTailBytes > 0
        ? Math.round(parsed.logTailBytes)
        : DEFAULTS.logTailBytes,
  };
}

const APP = 'tacuchi-updater';

/**
 * Config dir. Windows uses %APPDATA% (via env-paths) instead of a dotfile in the
 * home dir; macOS/Linux KEEP the legacy `~/.tacuchi-updater` so their behavior is
 * unchanged.
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') return envPaths(APP, { suffix: '' }).config;
  return path.join(os.homedir(), '.tacuchi-updater');
}

/** Log dir. Windows uses %LOCALAPPDATA% (non-roamed → no OneDrive churn). */
export function getLogDir(): string {
  if (process.platform === 'win32') return envPaths(APP, { suffix: '' }).log;
  return path.join(getConfigDir(), 'logs');
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/** Best-effort one-time migration of the legacy dotdir config to %APPDATA% (win32). */
function migrateLegacyConfig(): void {
  if (process.platform !== 'win32') return;
  try {
    const target = getConfigPath();
    if (fs.existsSync(target)) return;
    const legacy = path.join(os.homedir(), '.tacuchi-updater', 'config.json');
    if (!fs.existsSync(legacy)) return;
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(legacy, target);
  } catch {
    /* migration is best-effort */
  }
}

export function loadConfig(): UserConfig {
  migrateLegacyConfig();
  const configPath = getConfigPath();
  try {
    if (!fs.existsSync(configPath)) return { ...DEFAULTS };
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UserConfig>;
    return normalizeConfig(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: UserConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const target = getConfigPath();
  const tmp = target + '.tmp';
  const data = JSON.stringify(config, null, 2);
  try {
    // Atomic write: temp + rename.
    fs.writeFileSync(tmp, data, 'utf-8');
    fs.renameSync(tmp, target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // Windows: AV / OneDrive / a concurrent reader can lock the rename (EPERM/EBUSY).
    // Fall back to a direct (non-atomic) write so the change is not lost.
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EEXIST') {
      fs.writeFileSync(target, data, 'utf-8');
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore stray temp */
      }
    } else {
      throw err;
    }
  }
}

export function isManagerEnabled(config: UserConfig, managerId: string): boolean {
  if (Object.prototype.hasOwnProperty.call(config.enabledManagers, managerId)) {
    return config.enabledManagers[managerId] ?? true;
  }
  return true; // habilitado por defecto si no hay config explícita
}
