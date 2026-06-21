import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';
import { makeFractionParser } from '../../lib/exec/percent.js';

// dnf prints "Verifying : N/M" during the transaction (best-effort; only streams
// under sudoMode). Other phases fall back to the spinner.
const dnfVerifyPercent = makeFractionParser(/Verifying\s*:\s*(\d+)\/(\d+)/);

/**
 * Parse `dnf check-update` output. Pure + testable.
 *
 * `dnf check-update` exits 0 (nothing to do, empty stdout) or 100 (updates
 * available). The listing is whitespace-columned:
 *
 *   <name>.<arch>   <new-version>   <repo>
 *
 * Header noise ("Last metadata expiration...") and the trailing "Obsoleting
 * Packages" section are skipped. dnf does not report the currently installed
 * version in this view, so currentVersion is reported as "installed".
 */
export function parseDnfOutdated(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('Last') && !l.startsWith('Obsoleting'))
    .map(line => {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 2) return null;
      return {
        name: cols[0]?.split('.')[0] ?? 'Unknown',
        currentVersion: 'installed',
        newVersion: cols[1] ?? '?',
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const dnf: ManagerDescriptor = {
  id: 'dnf',
  group: 'system',
  platforms: ['linux'],
  requiresAdmin: true,
  kind: 'direct',
  detectCmd: { cmd: 'dnf', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.trim(),
  listOutdatedCmd: () => ({ cmd: 'dnf', args: ['check-update'] }),
  // `dnf check-update` exits 100 when updates are available (0 = none).
  listOkExitCodes: [100],
  parseOutdated: stdout => parseDnfOutdated(stdout),
  // Single bulk upgrade; the engine runs it under sudo when sudoMode is on and
  // shows manualCommand otherwise.
  upgradeCmd: () => ({ cmd: 'dnf', args: ['upgrade', '-y'] }),
  manualCommand: () => 'sudo dnf upgrade',
  percentParser: line => dnfVerifyPercent(line),
};
