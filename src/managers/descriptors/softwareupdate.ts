import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `softwareupdate -l` output. macOS prints available updates as lines
 * beginning with `* <label>` optionally followed by ` - <description>`.
 * When nothing is pending it prints "No new software available." Pure + testable.
 */
export function parseSoftwareUpdateOutdated(stdout: string, stderr = ''): OutdatedPackage[] {
  const output = stdout + stderr;
  if (output.includes('No new software available')) return [];

  const packages: OutdatedPackage[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*\*\s+(.+?)(?:\s+-\s+(.+))?$/);
    if (match) {
      packages.push({
        name: match[1]?.trim() ?? 'Unknown',
        currentVersion: 'installed',
        newVersion: match[2]?.trim() ?? 'available',
      });
    }
  }
  return packages;
}

export const softwareupdate: ManagerDescriptor = {
  id: 'softwareupdate',
  group: 'system',
  platforms: ['darwin'],
  requiresAdmin: false,
  kind: 'readonly',
  detectCmd: { cmd: 'softwareupdate', args: ['--help'], timeout: 3000 },
  parseVersion: () => 'macOS nativo',
  listOutdatedCmd: () => ({ cmd: 'softwareupdate', args: ['-l'] }),
  parseOutdated: (stdout, stderr) => parseSoftwareUpdateOutdated(stdout, stderr),
  manualCommand: () => 'sudo softwareupdate -i -a',
};
