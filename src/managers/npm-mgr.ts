import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

interface NpmOutdatedEntry {
  current: string;
  wanted: string;
  latest: string;
}

export const npmMgr: PackageManager = {
  id: 'npm',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('npm', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    return { available: true, version: result.stdout.trim() };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    // exit code 1 cuando hay desactualizados (es el comportamiento normal de npm)
    const result = await execCommand('npm', ['outdated', '-g', '--json'], 30_000);
    if (!result.stdout.trim()) return [];
    try {
      const data = JSON.parse(result.stdout) as Record<string, NpmOutdatedEntry>;
      return Object.entries(data)
        .filter(([, info]) => info.current !== info.latest)
        .map(([name, info]) => ({
          name,
          currentVersion: info.current,
          newVersion: info.latest,
        }));
    } catch {
      return [];
    }
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando paquetes npm globales...' };
    const args = packages && packages.length > 0
      ? ['update', '-g', ...packages]
      : ['update', '-g'];
    yield { type: 'log', message: `npm ${args.join(' ')}` };
    yield* execStream('npm', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    yield { type: 'start', message: 'Desinstalando paquetes npm globales...' };
    const args = ['uninstall', '-g', ...packages];
    yield { type: 'log', message: `npm ${args.join(' ')}` };
    yield* execStream('npm', args);
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
