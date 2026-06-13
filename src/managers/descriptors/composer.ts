import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

interface ComposerOutdatedEntry {
  name: string;
  version: string;
  latest: string;
}

/**
 * Parse `composer global outdated --format=json --direct`. Pure + testable.
 * Output shape: `{ "installed": [{ "name", "version", "latest", ... }] }`.
 */
export function parseComposerOutdated(stdout: string): OutdatedPackage[] {
  try {
    const data = JSON.parse(stdout) as { installed?: ComposerOutdatedEntry[] };
    return (data.installed ?? []).map(p => ({
      name: p.name,
      currentVersion: p.version,
      newVersion: p.latest,
    }));
  } catch {
    return [];
  }
}

export const composer: ManagerDescriptor = {
  id: 'composer',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'composer', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.match(/Composer version (\S+)/)?.[1],
  listOutdatedCmd: () => ({ cmd: 'composer', args: ['global', 'outdated', '--format=json', '--direct'] }),
  // composer can exit non-zero while still emitting valid JSON to stdout; the
  // engine treats exit 0 + listOkExitCodes as ok and the parser tolerates the rest.
  listOkExitCodes: [1],
  parseOutdated: stdout => parseComposerOutdated(stdout),
  // Single bulk update for all packages (no per-package loop).
  upgradeCmd: pkgs => ({
    cmd: 'composer',
    args: pkgs && pkgs.length ? ['global', 'update', ...pkgs] : ['global', 'update'],
  }),
};
