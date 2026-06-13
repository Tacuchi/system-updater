import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `mas outdated` output. Each line has the shape
 * `<id> <app name> (<current> -> <new>)`, e.g.
 *
 *   497799835 Xcode (14.0 -> 14.1)
 *   1295203466 Microsoft Remote Desktop (10.7.6 -> 10.8.0)
 *
 * The numeric App Store id is the only stable identifier `mas upgrade <id>`
 * accepts, so we use it as the package `name` (round-trips back into the bulk
 * upgrade command). Lines that don't match (blank/garbage) are dropped.
 * Pure + testable.
 */
export function parseMasOutdated(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // <id> <app name with spaces> (<current> -> <new>)
      const match = line.match(/^(\d+)\s+.+?\s+\(([^()]*?)\s*->\s*([^()]*?)\)\s*$/);
      if (!match) return null;
      const [, id, current, next] = match;
      return {
        // `mas upgrade` consumes the id, so it must be the round-trip name.
        name: id ?? 'Unknown',
        currentVersion: (current ?? '').trim() || '?',
        newVersion: (next ?? '').trim() || '?',
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const mas: ManagerDescriptor = {
  id: 'mas',
  group: 'apps',
  platforms: ['darwin'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'mas', args: ['version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.trim(),
  listOutdatedCmd: () => ({ cmd: 'mas', args: ['outdated'] }),
  parseOutdated: stdout => parseMasOutdated(stdout),
  // Single bulk command: `mas upgrade` with no args upgrades every outdated
  // app; with ids it upgrades exactly those. Never a per-package loop.
  upgradeCmd: pkgs => ({ cmd: 'mas', args: pkgs && pkgs.length ? ['upgrade', ...pkgs] : ['upgrade'] }),
};
