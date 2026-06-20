import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `scoop status` table output. Pure + testable.
 *
 * `scoop status` prints a PowerShell-style table whose body starts after a
 * separator row made of dashed groups (e.g. `----  -----------------  ...`).
 * Columns are: Name  "Installed Version"  "Latest Version"  "Missing
 * Dependencies"  Info. Cells are separated by runs of 2+ spaces. Scoop only
 * lists an app here when it has a newer version available, so every parsed
 * row is genuinely outdated. Rows with an empty "Latest Version" cell (apps
 * flagged only for missing dependencies / info, not a version bump) are
 * skipped, and informational preamble such as "Scoop is up to date." is
 * ignored because it appears before the dashed separator.
 */
export function parseScoopOutdated(stdout: string): OutdatedPackage[] {
  const packages: OutdatedPackage[] = [];
  const lines = stdout.split('\n');
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    // A separator row is only dashes and spaces, with at least one dash run.
    if (/^\s*-+(\s+-+)*\s*$/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(/\s{2,}/);
    // Name  Installed Version  Latest Version  [Missing Dependencies]  [Info]
    const name = cols[0];
    const current = cols[1];
    const latest = cols[2];
    if (!name || !current || !latest) continue;
    packages.push({ name, currentVersion: current, newVersion: latest });
  }
  return packages;
}

// scoop installs three shims in %USERPROFILE%\scoop\shims: `scoop` (extensionless),
// `scoop.ps1` and `scoop.cmd`. execa runs with shell:false, and cross-spawn only
// resolves names that PATHEXT knows about — the extensionless shim is invisible and
// `scoop.ps1` would be *opened* by cmd.exe, not executed. So every spawn targets
// `scoop.cmd` explicitly. (This descriptor is win32-only, so no platform branch is
// needed.) `manualCommand` stays `scoop ...` — the user types it in a shell where
// the bare shim resolves.
export const scoop: ManagerDescriptor = {
  id: 'scoop',
  group: 'apps',
  platforms: ['win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'scoop.cmd', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => {
    // `scoop --version` prints lines like "Current Scoop version:\nv0.3.1 ...".
    const m = stdout.match(/v?\d+\.\d+(?:\.\d+)?/);
    return m?.[0];
  },
  listOutdatedCmd: () => ({ cmd: 'scoop.cmd', args: ['status'] }),
  parseOutdated: stdout => parseScoopOutdated(stdout),
  // `scoop update` (no app) refreshes scoop itself + all buckets so the
  // following `scoop update *` / `scoop update <names>` sees the latest
  // manifests.
  preUpgradeCmds: () => [{ cmd: 'scoop.cmd', args: ['update'] }],
  // Single bulk command: `scoop update *` upgrades every app, otherwise one
  // invocation carrying every selected app name.
  upgradeCmd: pkgs =>
    pkgs && pkgs.length
      ? { cmd: 'scoop.cmd', args: ['update', ...pkgs] }
      : { cmd: 'scoop.cmd', args: ['update', '*'] },
  manualCommand: () => 'scoop update *',
};
