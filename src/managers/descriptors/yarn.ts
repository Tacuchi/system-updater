import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

export type YarnLine = 'classic' | 'berry';

/**
 * Decide which yarn line a `yarn --version` string belongs to. Classic is the
 * 1.x line (global packages via the deprecated-but-present `yarn global`).
 * Berry is >=2 (Plug'n'Play, per-project deps, NO global mode). Pure + testable.
 *
 * Anything that does not parse to a major version is treated as classic, since
 * the only modern yarn that ships a non-numeric/garbage version is unexpected
 * and `yarn global` failing safe is better than skipping a real classic install.
 */
export function yarnLineFromVersion(version: string | undefined): YarnLine {
  const major = Number.parseInt((version ?? '').trim().split('.')[0] ?? '', 10);
  if (Number.isNaN(major)) return 'classic';
  return major >= 2 ? 'berry' : 'classic';
}

interface YarnTableEvent {
  type: string;
  data?: { head?: string[]; body?: string[][] };
}

/**
 * Parse `yarn global outdated --json` (classic 1.x). The output is newline-
 * delimited JSON; the package data lives in a single `{"type":"table",...}`
 * event whose `data.head` names the columns and `data.body` holds one row per
 * package. We map the `Package`/`Current`/`Latest` columns by header position
 * (yarn occasionally reorders or adds columns). Pure + testable.
 */
export function parseYarnGlobalOutdated(stdout: string): OutdatedPackage[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    let event: YarnTableEvent;
    try {
      event = JSON.parse(line) as YarnTableEvent;
    } catch {
      continue;
    }
    if (event.type !== 'table' || !event.data?.head || !event.data?.body) continue;

    const head = event.data.head;
    const nameIdx = head.indexOf('Package');
    const currentIdx = head.indexOf('Current');
    const latestIdx = head.indexOf('Latest');
    if (nameIdx === -1 || currentIdx === -1 || latestIdx === -1) return [];

    return event.data.body
      .map((row): OutdatedPackage | null => {
        const name = row[nameIdx];
        const current = row[currentIdx];
        const latest = row[latestIdx];
        if (!name || !current || !latest) return null;
        if (current === latest) return null;
        return { name, currentVersion: current, newVersion: latest };
      })
      .filter((x): x is OutdatedPackage => x !== null);
  }
  return [];
}

/** Cache the (sub-process) `yarn --version` probe + line decision per run. */
async function yarnLine(): Promise<YarnLine> {
  return once('yarn:line', async () => {
    const res = await execCommand('yarn', ['--version'], 3000);
    if (res.exitCode !== 0) return 'classic';
    return yarnLineFromVersion(res.stdout);
  });
}

async function listClassicOutdated(): Promise<OutdatedPackage[]> {
  // `yarn global outdated` exits non-zero when there ARE outdated packages, so
  // we parse regardless of exit code and rely on the JSON table event.
  const res = await execCommand('yarn', ['global', 'outdated', '--json'], 30_000);
  return parseYarnGlobalOutdated(res.stdout);
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  // Berry (>=2) has no global mode — nothing to enumerate at the manager level.
  if ((await yarnLine()) === 'berry') return [];
  return listClassicOutdated();
}

const BERRY_MANUAL = 'cd <proyecto> && yarn up -R "*"';

export const yarn: ManagerDescriptor = {
  id: 'yarn',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'yarn', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  manualCommand: () => BERRY_MANUAL,
  // Escape hatch: yarn needs version branching. Classic (1.x) manages global
  // packages via the deprecated-but-present `yarn global`; Berry (>=2) has NO
  // global mode, so there is nothing this tool can enumerate or bulk-upgrade —
  // berry deps live per-project (`yarn up` inside a project). We never fabricate
  // success: berry returns [] for listing and a noop + manualCommand on upgrade.
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      const line = await yarnLine();

      if (line === 'berry') {
        yield {
          type: 'log',
          severity: 'warn',
          message: `Yarn Berry (>=2) no tiene modo global; gestiona dependencias por proyecto. Comando manual: ${BERRY_MANUAL}`,
        };
        const result: UpgradeResult = {
          success: false,
          upgraded: 0,
          failed: 0,
          errors: [],
          skipped: 1,
          status: 'noop',
          manualCommand: BERRY_MANUAL,
          managerId: 'yarn',
        };
        return result;
      }

      // Classic 1.x: a single bulk `yarn global upgrade` (deprecated but works).
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando yarn (global)...' };

      const before = await listClassicOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        // One bulk command for all packages — never loop per package.
        const args =
          packages && packages.length
            ? ['global', 'upgrade', ...packages]
            : ['global', 'upgrade'];
        yield { type: 'log', message: `yarn ${args.join(' ')}` };
        const rec = yield* runStream('yarn', args, { timeoutMs: 300_000, sudo: false, signal: ctx.signal });
        commands.push(rec);
        logger.logCommand(rec);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listClassicOutdated();
      const result = reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands);
      return result;
    },
  },
};
