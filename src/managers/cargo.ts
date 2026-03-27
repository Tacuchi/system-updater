import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const cargo: PackageManager = {
  id: 'cargo',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('rustup', ['--version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/rustup (\S+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const result = await execCommand('rustup', ['check'], 15_000);
    if (result.exitCode !== 0) return [];

    const packages: OutdatedPackage[] = [];
    for (const line of result.stdout.split('\n')) {
      // Formato: "stable-aarch64-apple-darwin - Update available : 1.77.0 (abcdef) -> 1.78.0 (123456)"
      const match = line.match(/^(\S+)\s+-\s+Update available\s*:\s*(\S+).*->\s*(\S+)/);
      if (match) {
        packages.push({
          name: match[1] ?? 'rust',
          currentVersion: match[2] ?? '?',
          newVersion: match[3] ?? '?',
        });
      }
    }
    return packages;
  },

  async *upgrade(): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando Rust toolchains...' };
    yield { type: 'log', message: 'rustup update' };
    yield* execStream('rustup', ['update']);
    return { success: true, upgraded: 1, failed: 0, errors: [] };
  },
};
