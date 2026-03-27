import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Language } from '../i18n/index.js';

export type Verbosity = 'debug' | 'info' | 'warn' | 'error';

export interface UserConfig {
  enabledManagers: Record<string, boolean>;
  verbosity: Verbosity;
  language: Language;
}

const DEFAULTS: UserConfig = {
  enabledManagers: {},
  verbosity: 'info',
  language: 'es',
};

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
    return { ...DEFAULTS, ...parsed };
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
