import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

interface PipOutdatedEntry {
  name: string;
  version: string;
  latest_version: string;
}

function getPipCmd(): string {
  return process.platform === 'win32' ? 'pip' : 'pip3';
}

export const pip: PackageManager = {
  id: 'pip',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const cmd = getPipCmd();
    const result = await execCommand(cmd, ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/pip (\S+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const cmd = getPipCmd();
    const result = await execCommand(cmd, ['list', '--outdated', '--format=json'], 30_000);
    if (result.exitCode !== 0) return [];
    try {
      const data = JSON.parse(result.stdout) as PipOutdatedEntry[];
      return data.map(p => ({
        name: p.name,
        currentVersion: p.version,
        newVersion: p.latest_version,
      }));
    } catch {
      return [];
    }
  },

  async *upgrade(packages?: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    const cmd = getPipCmd();
    yield { type: 'start', message: 'Actualizando pip...' };

    // Actualizar pip mismo
    yield { type: 'log', message: `${cmd} install --user --upgrade pip` };
    yield* execStream(cmd, ['install', '--user', '--upgrade', 'pip']);

    // Actualizar paquetes específicos o todos los desactualizados
    if (packages && packages.length > 0) {
      for (const pkg of packages) {
        yield { type: 'log', message: `${cmd} install --user --upgrade ${pkg}` };
        yield* execStream(cmd, ['install', '--user', '--upgrade', pkg]);
      }
    }

    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },
};
