import { execCommand, execStream } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const flutter: PackageManager = {
  id: 'flutter',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('flutter', ['--version', '--machine'], 5000);
    if (result.exitCode !== 0) return { available: false };
    try {
      const data = JSON.parse(result.stdout) as { frameworkVersion?: string };
      return { available: true, version: data.frameworkVersion ?? result.stdout.split('\n')[0]?.trim() };
    } catch {
      const version = result.stdout.match(/Flutter (\S+)/)?.[1];
      return { available: true, version };
    }
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    // Obtener versión actual via JSON
    const versionResult = await execCommand('flutter', ['--version', '--machine'], 10_000);
    let currentVersion: string | undefined;
    try {
      const data = JSON.parse(versionResult.stdout) as { frameworkVersion?: string };
      currentVersion = data.frameworkVersion;
    } catch {
      currentVersion = versionResult.stdout.match(/Flutter (\S+)/)?.[1];
    }
    if (!currentVersion) return [];

    // Consultar última versión estable via Flutter releases API
    const platformKey = process.platform === 'darwin' ? 'macos'
      : process.platform === 'win32' ? 'windows' : 'linux';
    const apiUrl = `https://storage.googleapis.com/flutter_infra_release/releases/releases_${platformKey}.json`;
    try {
      const apiResult = await execCommand('curl', ['-sL', apiUrl], 10_000);
      const releases = JSON.parse(apiResult.stdout) as {
        releases: Array<{ version: string; channel: string }>;
      };
      const latest = releases.releases.find(r => r.channel === 'stable');
      if (!latest || latest.version === currentVersion) return [];
      return [{
        name: 'flutter-sdk',
        currentVersion,
        newVersion: latest.version,
      }];
    } catch {
      // Fallback: verificar si flutter --version muestra el banner
      const textResult = await execCommand('flutter', ['--version'], 10_000);
      const output = textResult.stdout + textResult.stderr;
      if (output.includes('A new version of Flutter is available')) {
        return [{
          name: 'flutter-sdk',
          currentVersion,
          newVersion: 'disponible',
        }];
      }
      return [];
    }
  },

  async *upgrade(): AsyncGenerator<ProgressEvent, UpgradeResult> {
    yield { type: 'start', message: 'Actualizando Flutter SDK...' };
    // --force: permite actualizar aunque haya cambios locales en el checkout
    yield { type: 'log', message: 'flutter upgrade --force' };
    yield* execStream('flutter', ['upgrade', '--force'], 600_000);
    return { success: true, upgraded: 1, failed: 0, errors: [] };
  },
};
