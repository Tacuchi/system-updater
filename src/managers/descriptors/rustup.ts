import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `rustup check` output. Pure + testable.
 *
 * `rustup check` reports one line per installed toolchain plus a final line for
 * the `rustup` binary itself. A behind entry reads:
 *   `stable-aarch64-apple-darwin - Update available : 1.77.0 (abcdef) -> 1.78.0 (123456)`
 *   `rustup - Update available : 1.26.0 -> 1.27.0`
 * Up-to-date entries read `... - Up to date : 1.78.0 (...)` and are skipped.
 *
 * We emit one OutdatedPackage per toolchain/component that is behind. The
 * version tokens are the first whitespace-delimited token after the `:` and
 * after the `->` (the trailing `(hash date)` is dropped).
 */
export function parseRustupCheck(stdout: string): OutdatedPackage[] {
  const packages: OutdatedPackage[] = [];
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(\S+)\s+-\s+Update available\s*:\s*(\S+).*->\s*(\S+)/);
    if (match) {
      packages.push({
        name: match[1] ?? 'rust',
        currentVersion: match[2] ?? '?',
        newVersion: match[3] ?? '?',
      });
    }
  }
  return packages;
}

/**
 * Rust toolchain updater (rustup). The legacy `cargo` descriptor was actually
 * driving rustup; this is the correctly-named successor.
 *
 * Declarative: `rustup check` gives a machine-readable "outdated" listing, and
 * `rustup update` bulk-updates ALL toolchains in a single command. It does NOT
 * accept per-package args, so the upgrade command is identical regardless of
 * which toolchains were selected — `packages` is intentionally ignored.
 */
export const rustup: ManagerDescriptor = {
  id: 'rustup',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'rustup', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.match(/rustup (\S+)/)?.[1],
  listOutdatedCmd: () => ({ cmd: 'rustup', args: ['check'], timeout: 15_000 }),
  parseOutdated: stdout => parseRustupCheck(stdout),
  upgradeCmd: () => ({ cmd: 'rustup', args: ['update'] }),
};
