import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

const ACCEPT = ['--accept-source-agreements', '--accept-package-agreements'];
// Non-interactive upgrade flags. `--source winget` avoids the msstore agreement
// gate; `--silent`/`--disable-interactivity` suppress prompts. NOTE: winget has NO
// `--no-progress` flag — the spinner is suppressed via the winget *setting*
// visual.progressBar=disabled (gated; not auto-applied to the user's config here).
const UPGRADE_FLAGS = ['--silent', '--disable-interactivity', '--source', 'winget', ...ACCEPT];
// "Nothing to upgrade" HRESULTs (0x8A15002B / 0x8A15004F) in both unsigned and
// signed int32 forms, since Node may surface either as the process exit code.
const WINGET_OK_CODES = [0, 0x8a15002b, 0x8a15004f, 0x8a15002b - 0x1_0000_0000, 0x8a15004f - 0x1_0000_0000];

/**
 * Parse `winget list --upgrade-available` by COLUMN OFFSET, not whitespace.
 *
 * winget prints a fixed-width, left-aligned table whose body follows a row of
 * dashes. The Name column contains spaces (e.g. "Microsoft Edge"), so splitting
 * on runs of spaces misaligns the columns and would treat a Version as the Id.
 * Instead we take each column's start offset from the header (locale-independent:
 * we rely on column ORDER — Name, Id, Version, Available, [Source]) and slice the
 * data rows at those offsets. winget also interleaves a progress spinner with
 * carriage returns, so we keep only the text after the last \r and drop spinner
 * glyphs. Pure + testable.
 */
export function parseWingetOutdated(stdout: string): OutdatedPackage[] {
  const lines = stdout
    .split('\n')
    .map(l => (l.split('\r').pop() ?? l).replace(/[⠀-⣿]/g, '').replace(/\s+$/, ''));

  const dashIdx = lines.findIndex(l => l.trim().length >= 3 && /^-+$/.test(l.trim()));
  if (dashIdx < 1) return [];
  const header = lines[dashIdx - 1] ?? '';

  const starts: number[] = [];
  for (const m of header.matchAll(/\S+/g)) starts.push(m.index ?? 0);
  if (starts.length < 4) return [];

  const cell = (line: string, i: number): string =>
    (i < starts.length - 1 ? line.slice(starts[i], starts[i + 1]) : line.slice(starts[i])).trim();

  const out: OutdatedPackage[] = [];
  for (let i = dashIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const id = cell(line, 1);
    const current = cell(line, 2);
    const available = cell(line, 3);
    // Skip trailing summary footers ("N upgrades available.") — no Id/Available.
    if (!id || !available) continue;
    out.push({ name: id, currentVersion: current || '?', newVersion: available || '?' });
  }
  return out;
}

async function listWinget(): Promise<OutdatedPackage[]> {
  const res = await execCommand(
    'winget',
    ['list', '--upgrade-available', '--include-unknown', '--accept-source-agreements'],
    60_000,
  );
  return parseWingetOutdated(res.stdout);
}

export const winget: ManagerDescriptor = {
  id: 'winget',
  group: 'apps',
  platforms: ['win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'winget', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  listOutdatedCmd: () => ({
    cmd: 'winget',
    args: ['list', '--upgrade-available', '--include-unknown', '--accept-source-agreements'],
  }),
  parseOutdated: stdout => parseWingetOutdated(stdout),
  // Escape hatch: winget upgrades ONE package per invocation (no multi-target),
  // so a single bulk `--id A --id B` silently fails. Loop one `winget upgrade
  // --exact --id <id>` per selected package, then verify by re-listing.
  escapeHatch: {
    listOutdated: listWinget,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando winget...' };
      const before = await listWinget();
      const targets = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      const run = async function* (args: string[]): AsyncGenerator<ProgressEvent, void> {
        yield { type: 'log', message: `winget ${args.join(' ')}` };
        const rec = yield* runStream('winget', args, { timeoutMs: 600_000, sudo: false, signal: ctx.signal });
        commands.push(rec);
        logger.logCommand(rec);
      };

      if (!targets.length) {
        // Bulk "--all": no per-package loop → no countable %, the spinner carries it.
        yield* run(['upgrade', '--all', '--include-unknown', '--include-pinned', ...UPGRADE_FLAGS]);
      } else {
        // winget upgrades one package per invocation; the loop index IS the
        // progress. Emit a real % after each package completes (X of N done).
        const n = targets.length;
        for (let i = 0; i < n; i++) {
          const id = targets[i]!;
          yield* run(['upgrade', '--exact', '--id', id, '--include-unknown', ...UPGRADE_FLAGS]);
          yield { type: 'progress', message: `(${i + 1}/${n}) ${id}`, percent: Math.round(((i + 1) / n) * 100) };
        }
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listWinget();
      return reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands, WINGET_OK_CODES);
    },
  },
};
