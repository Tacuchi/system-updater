import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

interface CondaDryRunAction {
  name: string;
  version: string;
  old_version?: string;
}

interface CondaDryRunJson {
  actions?: { FETCH?: CondaDryRunAction[]; LINK?: CondaDryRunAction[] };
}

/**
 * Parse `conda update --all --dry-run --json` output. Conda emits the plan as
 * JSON under `actions` (FETCH preferred, LINK as fallback); only entries that
 * carry an `old_version` represent an actual upgrade of an installed package.
 * Conda may print the JSON on stdout or (on some exit-1 paths) stderr, so both
 * are tried. Pure + testable.
 */
export function parseCondaOutdated(stdout: string, stderr: string): OutdatedPackage[] {
  try {
    const data = JSON.parse(stdout || stderr) as CondaDryRunJson;
    const actions = data.actions?.FETCH ?? data.actions?.LINK ?? [];
    return actions
      .filter(a => a.old_version)
      .map(a => ({
        name: a.name,
        currentVersion: a.old_version ?? '?',
        newVersion: a.version,
      }));
  } catch {
    return [];
  }
}

export const conda: ManagerDescriptor = {
  id: 'conda',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'conda', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim().replace('conda ', '') || undefined,
  // Heavy dry-run that computes the full update plan; conda exits 1 when there
  // is a non-fatal solver note, so treat both 0 and 1 as "ok".
  listOutdatedCmd: () => ({ cmd: 'conda', args: ['update', '--all', '--dry-run', '--json'] }),
  parseOutdated: (stdout, stderr) => parseCondaOutdated(stdout, stderr),
  listOkExitCodes: [0, 1],
  // Single bulk command: every package at once (`update --all` when no explicit
  // target list, otherwise `update -y <pkgs>`).
  upgradeCmd: pkgs => ({
    cmd: 'conda',
    args: pkgs && pkgs.length ? ['update', '-y', ...pkgs] : ['update', '--all', '-y'],
  }),
  // Re-run the same dry-run to recompute what is still outdated after upgrading.
  verify: {
    cmd: () => ({ cmd: 'conda', args: ['update', '--all', '--dry-run', '--json'] }),
    parseStillOutdated: (stdout, stderr) => parseCondaOutdated(stdout, stderr).map(p => p.name),
  },
};
