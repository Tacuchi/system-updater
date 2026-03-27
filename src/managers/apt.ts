import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const apt: PackageManager = {
  id: 'apt',
  platforms: ['linux'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('apt', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.split('\n')[0]?.replace('apt ', '').split(' ')[0];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('apt', ['list', '--upgradable'], 30_000);
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split('\n')
      .filter(l => l.includes('[upgradable'))
      .map(line => {
        const match = line.match(/^(\S+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s+([^\]]+)\]/);
        if (!match) return null;
        return {
          name: match[1]?.split(':')[0] ?? 'Unknown',
          currentVersion: match[3]?.trim() ?? '?',
          newVersion: match[2] ?? '?',
        };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Requiere permisos de administrador (sudo).' };
      yield { type: 'log', message: 'Comando manual: sudo apt update && sudo apt upgrade' };
      yield { type: 'log', message: 'O ejecuta: updater --sudo' };
      return { success: false, upgraded: 0, failed: 0, errors: [], manualCommand: 'sudo apt update && sudo apt upgrade' };
    }

    yield { type: 'start', message: 'Actualizando paquetes apt (sudo)...' };
    yield { type: 'log', message: 'sudo apt update' };
    yield* execStream('apt', ['update'], 120_000, true);
    yield { type: 'log', message: 'sudo apt upgrade -y' };
    yield* execStream('apt', ['upgrade', '-y'], 300_000, true);
    return { success: true, upgraded: 0, failed: 0, errors: [] };
  },
};
