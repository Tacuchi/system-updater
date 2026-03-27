import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const flatpak: PackageManager = {
  id: 'flatpak',
  platforms: ['linux'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('flatpak', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.trim().replace('Flatpak ', '');
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand(
      'flatpak',
      ['remote-ls', '--updates', '--columns=application,version'],
      30_000
    );
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const cols = line.split('\t');
        return {
          name: cols[0]?.trim() ?? 'Unknown',
          currentVersion: 'installed',
          newVersion: cols[1]?.trim() ?? 'available',
        };
      });
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando aplicaciones Flatpak...' };
    const args = packages && packages.length > 0
      ? ['update', '-y', ...packages]
      : ['update', '-y'];
    yield { type: 'log', message: `flatpak ${args.join(' ')}` };
    yield* execStream('flatpak', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    yield { type: 'start', message: 'Desinstalando paquetes Flatpak...' };
    const args = ['uninstall', '-y', ...packages];
    yield { type: 'log', message: `flatpak ${args.join(' ')}` };
    yield* execStream('flatpak', args);
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
