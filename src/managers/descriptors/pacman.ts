import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `checkupdates` / `pacman -Qu` output. Each line has the shape
 * `name oldVersion -> newVersion`, e.g. `linux 6.8.1-1 -> 6.8.2-1`.
 * Lines that don't match (warnings, blanks) are dropped. Pure + testable.
 */
export function parsePacmanOutdated(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\S+)\s+(\S+)\s+->\s+(\S+)/);
      if (!match) return null;
      return {
        name: match[1] ?? 'Unknown',
        currentVersion: match[2] ?? '?',
        newVersion: match[3] ?? '?',
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const pacman: ManagerDescriptor = {
  id: 'pacman',
  group: 'system',
  platforms: ['linux'],
  requiresAdmin: true,
  kind: 'direct',
  detectCmd: { cmd: 'pacman', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.trim(),
  // `checkupdates` queries upstream without touching the local DB and exits
  // non-zero (2) when there are no updates — that's still a valid empty result.
  listOutdatedCmd: () => ({ cmd: 'checkupdates', args: [] }),
  parseOutdated: stdout => parsePacmanOutdated(stdout),
  listOkExitCodes: [2],
  // Single bulk command: -Syu syncs the DB and upgrades everything at once.
  upgradeCmd: () => ({ cmd: 'pacman', args: ['-Syu', '--noconfirm'] }),
  manualCommand: () => 'sudo pacman -Syu',
};
