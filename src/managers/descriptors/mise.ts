import type { ManagerDescriptor } from '../descriptor.js';
import type { OutdatedPackage } from '../types.js';

/**
 * Parse `mise outdated` output. Pure + testable.
 *
 * mise prints a whitespace-aligned table. The header names the columns; the
 * exact set varies by mise version, e.g.:
 *
 *   Tool    Requested  Current  Latest
 *   node    20         20.11.0  21.6.1
 *   python  latest     3.12.1   3.12.2
 *
 * Older builds omit the "Requested" column:
 *
 *   Tool    Current  Latest
 *   node    20.11.0  21.6.1
 *
 * We key off the header row to locate the Tool / Current / Latest columns so we
 * stay correct regardless of which optional columns are present. If no header is
 * found we fall back to positional columns tool/current/latest (first / second /
 * last). Header noise and blank lines are skipped; "missing" placeholders ("-")
 * for current/latest are normalized to "?".
 */
export function parseMiseOutdated(stdout: string): OutdatedPackage[] {
  const lines = stdout.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  // Locate the header so we can map columns by name (case-insensitive).
  const headerIdx = lines.findIndex(l => /^\s*tool\b/i.test(l));
  let toolCol = 0;
  let currentCol = -1;
  let latestCol = -1;
  let bodyStart = 0;

  if (headerIdx !== -1) {
    const headers = lines[headerIdx]!.trim().split(/\s+/).map(h => h.toLowerCase());
    toolCol = headers.indexOf('tool');
    if (toolCol === -1) toolCol = 0;
    currentCol = headers.indexOf('current');
    latestCol = headers.indexOf('latest');
    bodyStart = headerIdx + 1;
  }

  const norm = (v: string | undefined): string => {
    const t = v?.trim();
    return t && t !== '-' ? t : '?';
  };

  return lines
    .slice(bodyStart)
    .map((line): OutdatedPackage | null => {
      const cols = line.trim().split(/\s+/);
      const name = cols[toolCol];
      if (!name) return null;
      // Positional fallback: tool=first, current=second, latest=last.
      const cur = currentCol !== -1 ? cols[currentCol] : cols[1];
      const latest = latestCol !== -1 ? cols[latestCol] : cols[cols.length - 1];
      // A valid row needs at least a name plus a version column.
      if (cols.length < 2) return null;
      return { name, currentVersion: norm(cur), newVersion: norm(latest) };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

export const mise: ManagerDescriptor = {
  id: 'mise',
  group: 'sdk',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'mise', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.split('\n')[0]?.trim() || undefined,
  listOutdatedCmd: () => ({ cmd: 'mise', args: ['outdated'] }),
  parseOutdated: stdout => parseMiseOutdated(stdout),
  // Single bulk upgrade: `mise upgrade` (all tools) or `mise upgrade <tools>`.
  upgradeCmd: pkgs => ({ cmd: 'mise', args: pkgs && pkgs.length ? ['upgrade', ...pkgs] : ['upgrade'] }),
};
