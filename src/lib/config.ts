import fs from 'fs';
import path from 'path';
import os from 'os';
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

export function getConfigDir(): string {
  return path.join(os.homedir(), '.tacuchi-updater');
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): UserConfig {
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
  const tmp = getConfigPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, getConfigPath());
}

export function isManagerEnabled(config: UserConfig, managerId: string): boolean {
  if (Object.prototype.hasOwnProperty.call(config.enabledManagers, managerId)) {
    return config.enabledManagers[managerId] ?? true;
  }
  return true; // habilitado por defecto si no hay config explícita
}
