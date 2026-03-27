import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const gem: PackageManager = {
  id: 'gem',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('gem', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    return { available: true, version: result.stdout.trim() };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('gem', ['outdated'], 30_000);
    if (result.exitCode !== 0) return [];
    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        // Formato: "nombre (current < new)"
        const match = line.match(/^(\S+)\s+\(([^<]+)<\s+([^)]+)\)/);
        if (!match) return null;
        return {
          name: match[1] ?? '',
          currentVersion: match[2]?.trim() ?? '?',
          newVersion: match[3]?.trim() ?? '?',
        };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  },

  async *upgrade(packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    const useSudo = sudoMode ?? false;
    yield { type: 'start', message: `Actualizando gems...${useSudo ? ' (sudo)' : ''}` };

    const baseArgs = useSudo ? ['update'] : ['update', '--user-install'];
    const args = packages && packages.length > 0
      ? [...baseArgs, ...packages]
      : baseArgs;

    const prefix = useSudo ? 'sudo ' : '';
    yield { type: 'log', message: `${prefix}gem ${args.join(' ')}` };
    yield* execStream('gem', args, 300_000, useSudo);

    // Verificar qué paquetes siguen desactualizados después del update
    yield { type: 'log', message: 'Verificando resultado...' };
    const checkResult = await execCommand('gem', ['outdated'], 15_000);
    const stillOutdated = checkResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => line.match(/^(\S+)/)?.[1])
      .filter(Boolean) as string[];

    const requested = new Set(packages ?? []);
    const failedPkgs = requested.size > 0
      ? stillOutdated.filter(name => requested.has(name))
      : stillOutdated;

    const upgraded = (packages?.length ?? stillOutdated.length) - failedPkgs.length;
    const errors = failedPkgs.length > 0
      ? [useSudo
          ? `${failedPkgs.length} gem(s) no se pudieron actualizar: ${failedPkgs.slice(0, 5).join(', ')}`
          : `${failedPkgs.length} gem(s) del sistema requieren sudo: ${failedPkgs.slice(0, 5).join(', ')}`,
        ]
      : [];

    return {
      success: failedPkgs.length === 0,
      upgraded: Math.max(upgraded, 0),
      failed: failedPkgs.length,
      errors,
    };
  },
};
