import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

interface CondaDryRunAction {
  name: string;
  version: string;
  old_version?: string;
}

export const conda: PackageManager = {
  id: 'conda',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('conda', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.trim().replace('conda ', '');
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand(
      'conda',
      ['update', '--all', '--dry-run', '--json'],
      30_000
    );
    if (result.exitCode !== 0 && result.exitCode !== 1) return [];
    try {
      const data = JSON.parse(result.stdout || result.stderr) as {
        actions?: { FETCH?: CondaDryRunAction[]; LINK?: CondaDryRunAction[] };
      };
      const actions = data.actions?.FETCH ?? data.actions?.LINK ?? [];
      return actions
        .filter(a => a.old_version)
        .map(a => ({
          name: a.name,
          currentVersion: a.old_version ?? '?',
          newVersion: a.version,
        }));
    } catch {
      return [];
    }
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando entorno conda...' };
    const args = packages && packages.length > 0
      ? ['update', '-y', ...packages]
      : ['update', '--all', '-y'];
    yield { type: 'log', message: `conda ${args.join(' ')}` };
    yield* execStream('conda', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },
};
