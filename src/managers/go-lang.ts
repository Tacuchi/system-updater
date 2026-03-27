import { execCommand } from '../lib/executor.js';
import type { PackageManager, ManagerDetection, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';

export const goLang: PackageManager = {
  id: 'go',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: true,

  async detect(): Promise<ManagerDetection> {
    const result = await execCommand('go', ['version'], 3000);
    if (result.exitCode !== 0) return { available: false };
    const version = result.stdout.match(/go(\d+\.\d+\.\d+)/)?.[1];
    return { available: true, version };
  },

  async listOutdated(): Promise<OutdatedPackage[]> {
    const currentResult = await execCommand('go', ['version'], 3000);
    const currentVersion = currentResult.stdout.match(/go(\d+\.\d+\.\d+)/)?.[1];
    if (!currentVersion) return [];

    // Consultar la última versión estable desde golang.org
    try {
      const latestResult = await execCommand('curl', ['-sL', 'https://go.dev/VERSION?m=text'], 5000);
      const latest = latestResult.stdout.split('\n')[0]?.replace('go', '').trim();
      if (!latest || currentVersion === latest) return [];
      return [{
        name: 'go-sdk',
        currentVersion,
        newVersion: latest,
      }];
    } catch {
      return [];
    }
  },

  async *upgrade(_packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
    if (!sudoMode) {
      yield { type: 'error', message: 'Go no tiene auto-update. Descarga desde https://go.dev/dl/' };
      return {
        success: false,
        upgraded: 0,
        failed: 0,
        errors: [],
        manualCommand: 'https://go.dev/dl/',
      };
    }

    // En macOS con brew se puede actualizar go
    if (process.platform === 'darwin') {
      yield { type: 'start', message: 'Actualizando Go via Homebrew...' };
      yield { type: 'log', message: 'brew upgrade go' };
      const { execStream } = await import('../lib/executor.js');
      yield* execStream('brew', ['upgrade', 'go']);
      return { success: true, upgraded: 1, failed: 0, errors: [] };
    }

    yield { type: 'error', message: 'Descarga manualmente desde https://go.dev/dl/' };
    return {
      success: false,
      upgraded: 0,
      failed: 0,
      errors: [],
      manualCommand: 'https://go.dev/dl/',
    };
  },
};
