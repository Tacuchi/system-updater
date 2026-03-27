import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const choco: PackageManager = {
  id: 'choco',
  platforms: ['win32'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('choco', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    return { available: true, version: result.stdout.trim() };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    // --limit-output produce formato: nombre|versiónActual|versiónNueva|pinned
    const result = await execCommand('choco', ['outdated', '--limit-output'], 30_000);
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, current, latest] = line.split('|');
        if (!name || !current || !latest) return null;
        return {
          name,
          currentVersion: current,
          newVersion: latest,
        };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  },

  async *upgrade(packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Chocolatey requiere permisos de administrador.' };
      return {
        success: false,
        upgraded: 0,
        failed: 0,
        errors: [],
        manualCommand: 'choco upgrade all -y',
      };
    }

    yield { type: 'start', message: 'Actualizando paquetes Chocolatey...' };
    const args = packages && packages.length > 0
      ? ['upgrade', '-y', ...packages]
      : ['upgrade', 'all', '-y'];
    yield { type: 'log', message: `choco ${args.join(' ')}` };
    yield* execStream('choco', args);
    return { success: true, upgraded: packages?.length ?? 0, failed: 0, errors: [] };
  },

  async *uninstall(packages: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!packages.length) {
      return { success: true, upgraded: 0, failed: 0, errors: [] };
    }
    if (!sudoMode) {
      yield { type: 'error', message: 'Chocolatey requiere permisos de administrador.' };
      return {
        success: false,
        upgraded: 0,
        failed: 0,
        errors: [],
        manualCommand: `choco uninstall -y ${packages.join(' ')}`,
      };
    }
    yield { type: 'start', message: 'Desinstalando paquetes Chocolatey...' };
    const args = ['uninstall', '-y', ...packages];
    yield { type: 'log', message: `choco ${args.join(' ')}` };
    yield* execStream('choco', args);
    return { success: true, upgraded: packages.length, failed: 0, errors: [] };
  },
};
