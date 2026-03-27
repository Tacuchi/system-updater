import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const pacman: PackageManager = {
  id: 'pacman',
  platforms: ['linux'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('pacman', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.split('\n')[0]?.trim();
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('checkupdates', [], 30_000);
    if (result.exitCode !== 0 && !result.stdout.trim()) return [];

    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const match = line.match(/^(\S+)\s+(\S+)\s+->\s+(\S+)/);
        if (!match) return null;
        return {
          name: match[1] ?? 'Unknown',
          currentVersion: match[2] ?? '?',
          newVersion: match[3] ?? '?',
        };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Requiere permisos de administrador (sudo).' };
      yield { type: 'log', message: 'Comando manual: sudo pacman -Syu' };
      yield { type: 'log', message: 'O ejecuta: updater --sudo' };
      return { success: false, upgraded: 0, failed: 0, errors: [], manualCommand: 'sudo pacman -Syu' };
    }

    yield { type: 'start', message: 'Actualizando paquetes pacman (sudo)...' };
    yield { type: 'log', message: 'sudo pacman -Syu --noconfirm' };
    yield* execStream('pacman', ['-Syu', '--noconfirm'], 300_000, true);
    return { success: true, upgraded: 0, failed: 0, errors: [] };
  },
};
