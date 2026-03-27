import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const softwareupdate: PackageManager = {
  id: 'softwareupdate',
  platforms: ['darwin'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    await execCommand('softwareupdate', ['--help'], 3000);
    return { available: true, version: 'macOS nativo' };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('softwareupdate', ['-l'], 30_000);
    const output = result.stdout + result.stderr;
    if (output.includes('No new software available')) return [];

    const packages: OutdatedPackage[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*\*\s+(.+?)(?:\s+-\s+(.+))?$/);
      if (match) {
        packages.push({
          name: match[1]?.trim() ?? 'Unknown',
          currentVersion: 'installed',
          newVersion: match[2]?.trim() ?? 'available',
        });
      }
    }
    return packages;
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Requiere permisos de administrador.' };
      yield { type: 'log', message: 'Comando manual: sudo softwareupdate -i -a' };
      yield { type: 'log', message: 'O ejecuta: updater --sudo' };
      return { success: false, upgraded: 0, failed: 0, errors: [], manualCommand: 'sudo softwareupdate -i -a' };
    }

    yield { type: 'start', message: 'Instalando actualizaciones de macOS (sudo)...' };
    yield { type: 'log', message: 'sudo softwareupdate -i -a' };
    yield* execStream('softwareupdate', ['-i', '-a'], 600_000, true);
    return { success: true, upgraded: 0, failed: 0, errors: [] };
  },
};
