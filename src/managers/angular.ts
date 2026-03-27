import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const angular: PackageManager = {
  id: 'angular',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('ng', ['version'], 5000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/Angular CLI:\s*(\S+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const currentResult = await execCommand('ng', ['version'], 5000);
    const currentVersion = currentResult.stdout.match(/Angular CLI:\s*(\S+)/)?.[1];
    if (!currentVersion) return [];

    const latestResult = await execCommand('npm', ['view', '@angular/cli', 'version'], 10_000);
    const latestVersion = latestResult.stdout.trim();
    if (!latestVersion || currentVersion === latestVersion) return [];

    return [{
      name: '@angular/cli',
      currentVersion,
      newVersion: latestVersion,
    }];
  },

  async *upgrade(): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando Angular CLI...' };
    yield { type: 'log', message: 'npm update -g @angular/cli' };
    yield* execStream('npm', ['update', '-g', '@angular/cli']);
    return { success: true, upgraded: 1, failed: 0, errors: [] };
  },
};
