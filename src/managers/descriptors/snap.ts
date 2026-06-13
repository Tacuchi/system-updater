import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `snap refresh --list` output. Pure + testable.
 *
 * The command prints a header row followed by one row per refreshable snap:
 *
 *   Name        Version  Rev   Publisher   Notes
 *   core20      20240227 2264  canonical*  base
 *   firefox     123.0-2  3779  mozilla**   -
 *
 * When everything is current it prints "All snaps up to date." instead.
 * We preserve the legacy column mapping: name = Name, newVersion = Version,
 * currentVersion = Rev (the installed revision is the closest "current" hint
 * snap exposes in this listing).
 */
export function parseSnapOutdated(stdout: string): OutdatedPackage[] {
  if (stdout.includes('All snaps up to date')) return [];

  return stdout
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map(line => {
      const cols = line.trim().split(/\s+/);
      return {
        name: cols[0] ?? 'Unknown',
        currentVersion: cols[2] ?? '?',
        newVersion: cols[1] ?? 'available',
      };
    });
}

export const snap: ManagerDescriptor = {
  id: 'snap',
  group: 'apps',
  platforms: ['linux'],
  requiresAdmin: true,
  kind: 'direct',
  detectCmd: { cmd: 'snap', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.match(/snap\s+(\S+)/)?.[1],
  listOutdatedCmd: () => ({ cmd: 'snap', args: ['refresh', '--list'] }),
  parseOutdated: stdout => parseSnapOutdated(stdout),
  // Bulk refresh: a single `snap refresh [names...]`. With no names snap
  // refreshes every snap that has an update available.
  upgradeCmd: pkgs => ({ cmd: 'snap', args: pkgs && pkgs.length ? ['refresh', ...pkgs] : ['refresh'] }),
  manualCommand: () => 'sudo snap refresh',
};
