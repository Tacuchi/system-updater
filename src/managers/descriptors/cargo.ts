import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { once } from '../../lib/exec/capabilities.js';

// This descriptor manages globally-installed cargo BINARIES (e.g. `ripgrep`,
// `fd-find`) via the `cargo-install-update` subcommand (the `cargo-update`
// crate), NOT the Rust toolchain itself. It is DETECT-GATED: it only appears
// when that subcommand is installed, so it stays hidden on plain Rust setups.

/**
 * Parse `cargo install-update --list` output. Pure + testable.
 *
 * The output is a whitespace-aligned table that looks like:
 *
 *   Package  Installed  Latest   Needs update
 *   racer    2.0.0      2.0.1    Yes
 *   rustfmt  0.9.0      0.9.0    No
 *
 *   Note: ...
 *
 * A row is "outdated" when its "Needs update" column is `Yes` (case-insensitive).
 * The header row, blank lines and trailing notes are ignored. Some versions
 * append a `v` prefix to versions (e.g. `v2.0.0`) which is stripped.
 */
export function parseCargoInstallUpdateList(stdout: string): OutdatedPackage[] {
  const packages: OutdatedPackage[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 4) continue;
    const [name, installed, latest, needsUpdate] = cols;
    // Skip the header row and any non-data noise.
    if (!name || installed === 'Installed' || latest === 'Latest') continue;
    if ((needsUpdate ?? '').toLowerCase() !== 'yes') continue;
    packages.push({
      name,
      currentVersion: stripV(installed ?? '?'),
      newVersion: stripV(latest ?? '?'),
    });
  }
  return packages;
}

function stripV(v: string): string {
  return v.startsWith('v') ? v.slice(1) : v;
}

/**
 * Detect-gate on the presence of the `cargo-install-update` subcommand by
 * running `cargo install-update --version` and accepting only exit 0. Cached
 * for the lifetime of the process so repeated scans don't re-probe.
 */
async function detect(_ctx: ManagerCtx): Promise<{ available: boolean; version?: string }> {
  return once('cargo:detect', async () => {
    const res = await execCommand('cargo', ['install-update', '--version'], 5000);
    if (res.exitCode !== 0) return { available: false };
    // e.g. "cargo-install-update 11.1.2" — keep the version when present.
    const version = (res.stdout + res.stderr).match(/install-update\s+(\S+)/)?.[1];
    return { available: true, version };
  });
}

export const cargo: ManagerDescriptor = {
  id: 'cargo',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  // detectCmd is unused once escapeHatch.detect is present, but the contract
  // requires the field; mirror the probe for documentation/fallback parity.
  detectCmd: { cmd: 'cargo', args: ['install-update', '--version'], timeout: 5000 },
  // Detect-gate: only surface when `cargo install-update` is installed.
  escapeHatch: { detect },
  listOutdatedCmd: () => ({ cmd: 'cargo', args: ['install-update', '--list'], timeout: 30_000 }),
  parseOutdated: stdout => parseCargoInstallUpdateList(stdout),
  // BULK: one command for everything. `-a` updates all installed binaries; when
  // specific package names are requested, pass them as a single bulk invocation
  // (`cargo install-update <names>`) — never loop per package.
  upgradeCmd: pkgs =>
    pkgs && pkgs.length
      ? { cmd: 'cargo', args: ['install-update', ...pkgs] }
      : { cmd: 'cargo', args: ['install-update', '-a'] },
};
