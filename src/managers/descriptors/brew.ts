import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

interface BrewOutdatedEntry {
  name: string;
  installed_versions: string[];
  current_version: string;
}

/** Parse `brew outdated --json=v2` output (formulae + casks). Pure + testable. */
export function parseBrewOutdated(stdout: string): OutdatedPackage[] {
  try {
    const data = JSON.parse(stdout) as { formulae?: BrewOutdatedEntry[]; casks?: BrewOutdatedEntry[] };
    const all = [...(data.formulae ?? []), ...(data.casks ?? [])];
    return all.map(f => ({
      name: f.name,
      currentVersion: f.installed_versions?.[0] ?? '?',
      newVersion: f.current_version,
    }));
  } catch {
    return [];
  }
}

export const brew: ManagerDescriptor = {
  id: 'brew',
  group: 'system',
  platforms: ['darwin'],
  requiresAdmin: false,
  kind: 'direct',
  // Casks (e.g. docker-desktop) download + replace whole apps; 20 min headroom.
  defaultTimeoutMs: 1_200_000,
  detectCmd: { cmd: 'brew', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.replace('Homebrew ', '').trim(),
  listOutdatedCmd: () => ({ cmd: 'brew', args: ['outdated', '--json=v2'] }),
  parseOutdated: stdout => parseBrewOutdated(stdout),
  preUpgradeCmds: () => [{ cmd: 'brew', args: ['update'] }],
  upgradeCmd: pkgs => ({ cmd: 'brew', args: pkgs && pkgs.length ? ['upgrade', ...pkgs] : ['upgrade'] }),
  postUpgradeCmds: () => [{ cmd: 'brew', args: ['cleanup'] }],
};
