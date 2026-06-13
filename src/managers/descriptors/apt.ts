import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `apt list --upgradable` output. Pure + testable.
 *
 * Each upgradable line looks like:
 *   pkg/repo,now 2.0.0 amd64 [upgradable from: 1.0.0]
 * The package name may carry an architecture suffix (e.g. `libfoo:amd64`),
 * which we strip to the bare package name.
 */
export function parseAptUpgradable(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .filter(l => l.includes('[upgradable'))
    .map(line => {
      const match = line.match(/^(\S+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s+([^\]]+)\]/);
      if (!match) return null;
      return {
        name: match[1]?.split(':')[0] ?? 'Unknown',
        currentVersion: match[3]?.trim() ?? '?',
        newVersion: match[2] ?? '?',
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const apt: ManagerDescriptor = {
  id: 'apt',
  group: 'system',
  platforms: ['linux'],
  requiresAdmin: true,
  kind: 'direct',
  detectCmd: { cmd: 'apt', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.replace('apt ', '').split(' ')[0],
  listOutdatedCmd: () => ({ cmd: 'apt', args: ['list', '--upgradable'] }),
  parseOutdated: stdout => parseAptUpgradable(stdout),
  preUpgradeCmds: () => [{ cmd: 'apt', args: ['update'] }],
  upgradeCmd: () => ({ cmd: 'apt', args: ['upgrade', '-y'] }),
  manualCommand: () => 'sudo apt update && sudo apt upgrade',
};
