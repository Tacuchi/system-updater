import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `rustup check` output. Pure + testable.
 *
 * A toolchain with an available update looks like:
 *   `stable-aarch64-apple-darwin - Update available : 1.77.0 (abcdef) -> 1.78.0 (123456)`
 * Up-to-date toolchains read `... - Up to date : 1.78.0 (...)` and are skipped.
 * The `rustup` line (`rustup - Update available : ...`) is also captured.
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

export const cargo: ManagerDescriptor = {
  id: 'cargo',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'rustup', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.match(/rustup (\S+)/)?.[1],
  listOutdatedCmd: () => ({ cmd: 'rustup', args: ['check'], timeout: 15_000 }),
  parseOutdated: stdout => parseRustupCheck(stdout),
  // `rustup update` updates ALL toolchains in one shot and does not accept
  // per-package args, so the bulk command is always the same regardless of
  // which toolchains were selected (the legacy code ran exactly this).
  upgradeCmd: () => ({ cmd: 'rustup', args: ['update'] }),
};
