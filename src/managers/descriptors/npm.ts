import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

interface NpmOutdatedEntry {
  current: string;
  wanted: string;
  latest: string;
}

/**
 * Parse `npm outdated -g --json` output. The payload is an object keyed by
 * package name → { current, wanted, latest }. We surface only packages whose
 * installed version differs from the latest. Pure + testable.
 */
export function parseNpmOutdated(stdout: string): OutdatedPackage[] {
  if (!stdout.trim()) return [];
  try {
    const data = JSON.parse(stdout) as Record<string, NpmOutdatedEntry>;
    return Object.entries(data)
      .filter(([, info]) => info.current !== info.latest)
      .map(([name, info]) => ({
        name,
        currentVersion: info.current,
        newVersion: info.latest,
      }));
  } catch {
    return [];
  }
}

export const npm: ManagerDescriptor = {
  id: 'npm',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'npm', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  listOutdatedCmd: () => ({ cmd: 'npm', args: ['outdated', '-g', '--json'] }),
  parseOutdated: stdout => parseNpmOutdated(stdout),
  // `npm outdated` exits 1 when it actually lists outdated packages — that is
  // the normal, successful case, so treat exit 1 as ok for the listing.
  listOkExitCodes: [0, 1],
  upgradeCmd: pkgs => ({ cmd: 'npm', args: pkgs && pkgs.length ? ['update', '-g', ...pkgs] : ['update', '-g'] }),
};
