import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const snap: PackageManager = {
  id: 'snap',
  platforms: ['linux'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('snap', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/snap\s+(\S+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('snap', ['refresh', '--list'], 30_000);
    if (result.exitCode !== 0) return [];
    if (result.stdout.includes('All snaps up to date')) return [];

    return result.stdout
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map(line => {
        const cols = line.trim().split(/\s+/);
        return {
          name: cols[0] ?? 'Unknown',
          currentVersion: cols[2] ?? '?',
          newVersion: cols[1] ?? 'available',
        };
      });
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Requiere permisos de administrador (sudo).' };
      yield { type: 'log', message: 'Comando manual: sudo snap refresh' };
      yield { type: 'log', message: 'O ejecuta: updater --sudo' };
      return { success: false, upgraded: 0, failed: 0, errors: [], manualCommand: 'sudo snap refresh' };
    }

    yield { type: 'start', message: 'Actualizando snaps (sudo)...' };
    yield { type: 'log', message: 'sudo snap refresh' };
    yield* execStream('snap', ['refresh'], 300_000, true);
    return { success: true, upgraded: 0, failed: 0, errors: [] };
  },
};
