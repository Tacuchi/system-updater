import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

interface ComposerOutdatedEntry {
  name: string;
  version: string;
  latest: string;
}

export const composer: PackageManager = {
  id: 'composer',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('composer', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/Composer version (\S+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('composer', ['global', 'outdated', '--format=json', '--direct'], 30_000);
    if (result.exitCode !== 0 && !result.stdout.trim()) return [];
    try {
      const data = JSON.parse(result.stdout) as { installed?: ComposerOutdatedEntry[] };
      return (data.installed ?? []).map(p => ({
        name: p.name,
        currentVersion: p.version,
        newVersion: p.latest,
      }));
    } catch {
      return [];
    }
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando paquetes Composer globales...' };
    const args = packages && packages.length > 0
      ? ['global', 'update', ...packages]
      : ['global', 'update'];
    yield { type: 'log', message: `composer ${args.join(' ')}` };
    yield* execStream('composer', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    yield { type: 'start', message: 'Desinstalando paquetes Composer globales...' };
    const args = ['global', 'remove', ...packages];
    yield { type: 'log', message: `composer ${args.join(' ')}` };
    yield* execStream('composer', args);
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
