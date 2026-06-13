import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

// Why escape-hatch and not a declarative listOutdatedCmd + JSON parser:
// `pnpm outdated` does NOT reliably support a machine-readable `--json` /
// `--format json` for GLOBAL packages across versions — older pnpm prints
// nothing useful for globals in JSON mode and the schema has churned between
// majors. The human-readable box-drawing table emitted by
// `pnpm outdated --global` is the one stable, version-portable contract, so we
// parse that. Verification (before/after) is recomputed the same way.
//
// `pnpm outdated` exits 1 when there ARE outdated packages (like npm), so a
// non-zero exit is the normal "found updates" case, not a failure.

interface PnpmRow {
  name: string;
  current: string;
  latest: string;
}

/**
 * Parse the box-drawing table emitted by `pnpm outdated --global`. Pure +
 * testable.
 *
 * The table looks like:
 *
 *   ┌────────────┬─────────┬────────┐
 *   │ Package    │ Current │ Latest │
 *   ├────────────┼─────────┼────────┤
 *   │ typescript │ 5.2.2   │ 5.4.5  │
 *   └────────────┴─────────┴────────┘
 *
 * Notes handled defensively:
 * - The header row (Package/Current/Latest) is skipped.
 * - Border rows (┌ ├ └ and ASCII +---+ fallbacks) are skipped.
 * - Some pnpm versions append a "(deprecated)" marker or a dependency-type
 *   hint to the package name cell; we keep only the first whitespace-delimited
 *   token as the installable package name.
 * - A version cell may carry trailing annotations (e.g. an asterisk); we keep
 *   the leading version-looking token.
 * - Rows whose current === latest are dropped (nothing to do).
 */
export function parsePnpmOutdated(stdout: string): OutdatedPackage[] {
  const rows: PnpmRow[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Skip box border rows of either Unicode or ASCII flavour.
    if (/^[┌├└┬┼┴─┐┤┘+\-=|]+$/.test(line)) continue;
    // A data/header row is split by the vertical bar (│ or |).
    if (!/[│|]/.test(line)) continue;

    const cells = line
      .split(/[│|]/)
      .map(c => c.trim())
      .filter(c => c.length > 0);
    if (cells.length < 3) continue;

    const [nameCell, currentCell, latestCell] = cells;
    // Skip the header row.
    if (/^package$/i.test(nameCell ?? '')) continue;

    const name = (nameCell ?? '').split(/\s+/)[0] ?? '';
    const current = firstVersionToken(currentCell ?? '');
    const latest = firstVersionToken(latestCell ?? '');
    if (!name || !current || !latest) continue;
    if (current === latest) continue;

    rows.push({ name, current, latest });
  }
  return rows.map(r => ({ name: r.name, currentVersion: r.current, newVersion: r.latest }));
}

/** Keep the leading version-looking token from a (possibly annotated) cell. */
function firstVersionToken(cell: string): string {
  const token = cell.split(/\s+/)[0] ?? '';
  return token;
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  // `pnpm outdated` exits 1 when it finds outdated packages — accept 0 and 1.
  const res = await execCommand('pnpm', ['outdated', '--global'], 30_000);
  if (res.exitCode !== 0 && res.exitCode !== 1) return [];
  return parsePnpmOutdated(res.stdout);
}

export const pnpm: ManagerDescriptor = {
  id: 'pnpm',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'pnpm', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  // Escape hatch: pnpm has no reliable machine-readable outdated listing for
  // globals, so we parse the human-readable table (cached nowhere — it is cheap
  // and must reflect live state for before/after). Upgrade is a single bulk
  // `pnpm update -g` (or `pnpm update -g <names>` for a subset).
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando pnpm...' };

      const before = await listOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        // Single bulk command — never loop per package. With no explicit names
        // (`update -g`) pnpm updates every global package at once.
        const args = packages && packages.length ? ['update', '-g', ...packages] : ['update', '-g'];
        yield { type: 'log', message: `pnpm ${args.join(' ')}` };
        const rec = yield* runStream('pnpm', args, { timeoutMs: 300_000, sudo: false, signal: ctx.signal });
        commands.push(rec);
        logger.logCommand(rec);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listOutdated();
      const result = reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands);
      return result;
    },
  },
};
