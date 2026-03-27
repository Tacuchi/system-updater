import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const winget: PackageManager = {
  id: 'winget',
  platforms: ['win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('winget', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    return { available: true, version: result.stdout.trim() };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand(
      'winget',
      ['list', '--upgrade-available', '--accept-source-agreements'],
      30_000
    );
    if (result.exitCode !== 0) return [];

    const packages: OutdatedPackage[] = [];
    const lines = result.stdout.split('\n');
    let inTable = false;

    for (const line of lines) {
      if (line.includes('------')) { inTable = true; continue; }
      if (!inTable) continue;
      const cols = line.trim().split(/\s{2,}/);
      if (cols.length >= 4) {
        packages.push({
          name: cols[0] ?? 'Unknown',
          currentVersion: cols[2] ?? '?',
          newVersion: cols[3] ?? '?',
        });
      }
    }
    return packages;
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando paquetes con winget...' };
    const args = packages && packages.length > 0
      ? ['upgrade', '--accept-source-agreements', '--accept-package-agreements', ...packages]
      : ['upgrade', '--all', '--accept-source-agreements', '--accept-package-agreements'];
    yield { type: 'log', message: `winget ${args.join(' ')}` };
    yield* execStream('winget', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },
};
