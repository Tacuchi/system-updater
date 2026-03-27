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

    // Detectar si es un entorno gestionado externamente (PEP 668 / Homebrew Python)
    const testResult = await execCommand(cmd, ['install', '--user', '--dry-run', 'pip'], 5000);
    const isExternallyManaged = (testResult.stdout + testResult.stderr).includes('externally-managed');
    const extraFlags = isExternallyManaged ? ['--break-system-packages'] : [];

    if (isExternallyManaged) {
      yield { type: 'log', message: 'Entorno PEP 668 detectado, usando --break-system-packages' };
    }

    // Actualizar paquetes específicos o todos los desactualizados
    if (packages && packages.length > 0) {
      for (const pkg of packages) {
        const args = ['install', '--user', '--upgrade', ...extraFlags, pkg];
        yield { type: 'log', message: `${cmd} ${args.join(' ')}` };
        yield* execStream(cmd, args);
      }
    }

    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[]): AsyncGenerator<ProgressEvent, UpgradeResult> {
    const cmd = getPipCmd();
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    yield { type: 'start', message: 'Desinstalando paquetes pip...' };
    for (const pkg of packages) {
      const args = ['uninstall', '-y', pkg];
      yield { type: 'log', message: `${cmd} ${args.join(' ')}` };
      yield* execStream(cmd, args);
    }
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
