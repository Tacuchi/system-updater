import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

const PACKAGE = '@angular/cli';

/**
 * Parse the installed Angular CLI version out of `ng version` output. The real
 * output is a multi-line ASCII-art banner followed by a line like
 * `Angular CLI: 17.0.0`. Pure + testable.
 */
export function parseNgVersion(stdout: string): string | undefined {
  return stdout.match(/Angular CLI:\s*(\S+)/)?.[1];
}

/** Trim the bare version string printed by `npm view @angular/cli version`. */
export function parseLatestVersion(stdout: string): string | undefined {
  const v = stdout.trim();
  return v || undefined;
}

/** Latest published @angular/cli version, cached once per process run. */
async function latestVersion(): Promise<string | undefined> {
  return once('angular:latest', async () => {
    const res = await execCommand('npm', ['view', PACKAGE, 'version'], 10_000);
    if (res.exitCode !== 0) return undefined;
    return parseLatestVersion(res.stdout);
  });
}

/** Installed Angular CLI version (single `ng version` probe). */
async function installedVersion(): Promise<string | undefined> {
  const res = await execCommand('ng', ['version'], 5_000);
  if (res.exitCode !== 0) return undefined;
  return parseNgVersion(res.stdout);
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  const current = await installedVersion();
  if (!current) return [];
  const latest = await latestVersion();
  if (!latest || current === latest) return [];
  return [{ name: PACKAGE, currentVersion: current, newVersion: latest }];
}

export const angular: ManagerDescriptor = {
  id: 'angular',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'ng', args: ['version'], timeout: 5_000 },
  parseVersion: stdout => parseNgVersion(stdout),
  // Escape hatch: listOutdated compares the installed `ng version` against the
  // npm registry's latest (`npm view @angular/cli version`, cached) — a
  // two-tool introspection that cannot be expressed as one listOutdatedCmd.
  // Upgrade is a single bulk `npm install -g @angular/cli@latest`.
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, _ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando Angular CLI...' };

      const before = await listOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        const args = ['install', '-g', `${PACKAGE}@latest`];
        yield { type: 'log', message: `npm ${args.join(' ')}` };
        const rec = yield* runStream('npm', args, { timeoutMs: 300_000, sudo: false });
        commands.push(rec);
        logger.logCommand(rec);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await listOutdated();
      const result = reconcile(packages, before, { stillOutdated: after.map(p => ({ name: p.name })) }, commands);
      logger.logResult(result);
      return result;
    },
  },
};
