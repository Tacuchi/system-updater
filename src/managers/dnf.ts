import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const dnf: PackageManager = {
  id: 'dnf',
  platforms: ['linux'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('dnf', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.split('\n')[0]?.trim();
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('dnf', ['check-update'], 60_000);
    if (result.exitCode === 0) return [];
    if (result.exitCode !== 100) return [];

    return result.stdout
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('Last') && !l.startsWith('Obsoleting'))
      .map(line => {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 2) return null;
        return {
          name: cols[0]?.split('.')[0] ?? 'Unknown',
          currentVersion: 'installed',
          newVersion: cols[1] ?? '?',
        };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Requiere permisos de administrador (sudo).' };
      yield { type: 'log', message: 'Comando manual: sudo dnf upgrade' };
      yield { type: 'log', message: 'O ejecuta: updater --sudo' };
      return { success: false, upgraded: 0, failed: 0, errors: [], manualCommand: 'sudo dnf upgrade' };
    }

    yield { type: 'start', message: 'Actualizando paquetes dnf (sudo)...' };
    yield { type: 'log', message: 'sudo dnf upgrade -y' };
    yield* execStream('dnf', ['upgrade', '-y'], 300_000, true);
    return { success: true, upgraded: 0, failed: 0, errors: [] };
  },
};
