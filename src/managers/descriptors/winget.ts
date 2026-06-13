import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

const ACCEPT = ['--accept-source-agreements', '--accept-package-agreements'];

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
  const res = await execCommand('winget', ['list', '--upgrade-available', '--accept-source-agreements'], 60_000);
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
  listOutdatedCmd: () => ({ cmd: 'winget', args: ['list', '--upgrade-available', '--accept-source-agreements'] }),
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
        yield* run(['upgrade', '--all', ...ACCEPT]);
      } else {
        for (const id of targets) yield* run(['upgrade', '--exact', '--id', id, ...ACCEPT]);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listWinget();
      return reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands);
    },
  },
};
