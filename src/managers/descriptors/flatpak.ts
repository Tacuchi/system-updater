import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `flatpak remote-ls --updates --columns=application,version` output.
 * Pure + testable.
 *
 * With explicit `--columns`, flatpak prints one machine-friendly row per
 * updatable app, columns separated by a tab: `<application-id>\t<version>`.
 * The application id (e.g. `org.mozilla.firefox`) is the stable ref that is
 * fed back to `flatpak update -y <ref>`. The installed version isn't reported
 * by this listing, so currentVersion is a placeholder ('installed').
 */
export function parseFlatpakOutdated(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const cols = line.split('\t');
      return {
        name: cols[0]?.trim() ?? 'Unknown',
        currentVersion: 'installed',
        newVersion: cols[1]?.trim() || 'available',
      };
    })
    .filter(p => p.name && p.name !== 'Unknown');
}

export const flatpak: ManagerDescriptor = {
  id: 'flatpak',
  group: 'apps',
  platforms: ['linux'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'flatpak', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim().replace('Flatpak ', '') || undefined,
  listOutdatedCmd: () => ({
    cmd: 'flatpak',
    args: ['remote-ls', '--updates', '--columns=application,version'],
  }),
  parseOutdated: stdout => parseFlatpakOutdated(stdout),
  // Single bulk command: `flatpak update -y` for everything, or one invocation
  // carrying every selected ref (`flatpak update -y ref1 ref2 ...`).
  upgradeCmd: pkgs => ({
    cmd: 'flatpak',
    args: pkgs && pkgs.length ? ['update', '-y', ...pkgs] : ['update', '-y'],
  }),
};
