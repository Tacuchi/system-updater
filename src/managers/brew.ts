import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

interface BrewOutdatedEntry {
  name: string;
  installed_versions: string[];
  current_version: string;
}

export const brew: PackageManager = {
  id: 'brew',
  platforms: ['darwin'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('brew', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.split('\n')[0]?.replace('Homebrew ', '').trim();
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('brew', ['outdated', '--json=v2'], 30_000);
    if (result.exitCode !== 0) return [];
    try {
      const data = JSON.parse(result.stdout) as { formulae: BrewOutdatedEntry[]; casks: BrewOutdatedEntry[] };
      const formulae = data.formulae ?? [];
      const casks = data.casks ?? [];
      return [...formulae, ...casks].map(f => ({
        name: f.name,
        currentVersion: f.installed_versions[0] ?? '?',
        newVersion: f.current_version,
      }));
    } catch {
      return [];
    }
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando Homebrew...' };

    // brew update primero
    yield { type: 'log', message: 'brew update' };
    yield* execStream('brew', ['update']);

    // brew upgrade (paquetes específicos o todos)
    const upgradeArgs = packages && packages.length > 0 ? ['upgrade', ...packages] : ['upgrade'];
    yield { type: 'log', message: `brew ${upgradeArgs.join(' ')}` };
    yield* execStream('brew', upgradeArgs);

    // brew cleanup
    yield { type: 'log', message: 'brew cleanup' };
    yield* execStream('brew', ['cleanup']);

    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    yield { type: 'start', message: 'Desinstalando paquetes Homebrew...' };
    for (const pkg of packages) {
      yield { type: 'log', message: `brew uninstall ${pkg}` };
      yield* execStream('brew', ['uninstall', pkg]);
    }
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
