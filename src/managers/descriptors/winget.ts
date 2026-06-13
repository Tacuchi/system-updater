import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `winget list --upgrade-available` table output. Pure + testable.
 *
 * winget prints a fixed table whose body starts after a row of dashes
 * ("------"). Columns are: Name  Id  Version  Available  Source. Cells are
 * separated by runs of 2+ spaces. We key each package by its Id (winget's
 * stable identifier) so it can be fed back to `winget upgrade --id <id>`.
 */
export function parseWingetOutdated(stdout: string): OutdatedPackage[] {
  const packages: OutdatedPackage[] = [];
  const lines = stdout.split('\n');
  let inTable = false;

  for (const line of lines) {
    if (line.includes('------')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const cols = line.trim().split(/\s{2,}/);
    // Name  Id  Version  Available  [Source]
    if (cols.length >= 4) {
      packages.push({
        name: cols[1] ?? cols[0] ?? 'Unknown',
        currentVersion: cols[2] ?? '?',
        newVersion: cols[3] ?? '?',
      });
    }
  }
  return packages;
}

const ACCEPT_AGREEMENTS = [
  '--accept-source-agreements',
  '--accept-package-agreements',
];

export const winget: ManagerDescriptor = {
  id: 'winget',
  group: 'apps',
  platforms: ['win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'winget', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  listOutdatedCmd: () => ({
    cmd: 'winget',
    args: ['list', '--upgrade-available', '--accept-source-agreements'],
  }),
  parseOutdated: stdout => parseWingetOutdated(stdout),
  // Single bulk command: `winget upgrade --all` when nothing is selected,
  // otherwise one invocation carrying every selected id (`--id <id>` per pkg).
  upgradeCmd: pkgs => {
    if (pkgs && pkgs.length) {
      const idArgs = pkgs.flatMap(id => ['--id', id]);
      return { cmd: 'winget', args: ['upgrade', ...ACCEPT_AGREEMENTS, ...idArgs] };
    }
    return { cmd: 'winget', args: ['upgrade', '--all', ...ACCEPT_AGREEMENTS] };
  },
};
