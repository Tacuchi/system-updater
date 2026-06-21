import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `choco outdated --limit-output` output. Pure + testable.
 *
 * With `--limit-output`, Chocolatey emits one machine-readable line per
 * outdated package using pipe ("|") separators:
 *
 *   name|currentVersion|availableVersion|pinned
 *
 * e.g. `git|2.40.0|2.43.0|false`. Any line missing the name/current/latest
 * fields (blank lines, stray header/summary text without 3+ pipe fields) is
 * skipped.
 */
export function parseChocoOutdated(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [name, current, latest] = line.split('|');
      if (!name || !current || !latest) return null;
      return {
        name,
        currentVersion: current,
        newVersion: latest,
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const choco: ManagerDescriptor = {
  id: 'choco',
  group: 'apps',
  platforms: ['win32'],
  requiresAdmin: true,
  kind: 'direct',
  // Chocolatey "success" is not just 0: 1641 = reboot initiated, 3010 = reboot
  // required, 1605/1614 = already-(un)installed. Without these, a reboot-pending
  // upgrade would be misclassified as COMMAND_FAILED.
  successExitCodes: [0, 1605, 1614, 1641, 3010],
  detectCmd: { cmd: 'choco', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  listOutdatedCmd: () => ({ cmd: 'choco', args: ['outdated', '--limit-output'] }),
  parseOutdated: stdout => parseChocoOutdated(stdout),
  // Single bulk command: `choco upgrade all -y` when nothing is selected,
  // otherwise one invocation carrying every selected package name.
  upgradeCmd: pkgs =>
    pkgs && pkgs.length
      ? { cmd: 'choco', args: ['upgrade', ...pkgs, '-y'] }
      : { cmd: 'choco', args: ['upgrade', 'all', '-y'] },
  manualCommand: () => 'choco upgrade all -y',
};
