import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

// `pipx list --json` shape: a top-level object whose `venvs` map keys each
// installed application name to metadata. Each venv has a `main_package` plus
// any `injected_packages`; both carry a `package` name and `package_version`.
interface PipxPackageMeta {
  package?: string;
  package_version?: string;
}

interface PipxVenvMetadata {
  main_package?: PipxPackageMeta;
  injected_packages?: Record<string, PipxPackageMeta>;
}

interface PipxVenv {
  metadata?: PipxVenvMetadata;
}

interface PipxListJson {
  venvs?: Record<string, PipxVenv>;
}

/**
 * A flat name→version snapshot of every package pipx manages (main packages and
 * injected packages across all venvs). Used both to enumerate candidates and to
 * diff before/after an upgrade.
 */
export interface PipxSnapshot {
  [name: string]: string;
}

/**
 * Parse `pipx list --json` into a flat name→version map. Pure + testable.
 *
 * pipx has no "outdated" concept (it does not know the latest version without
 * querying PyPI), so we capture every managed package's installed version. The
 * engine treats a package whose version CHANGES across an upgrade as upgraded.
 */
export function parsePipxList(stdout: string): PipxSnapshot {
  const snapshot: PipxSnapshot = {};
  try {
    const data = JSON.parse(stdout) as PipxListJson;
    for (const venv of Object.values(data.venvs ?? {})) {
      const meta = venv.metadata;
      if (!meta) continue;
      const entries: (PipxPackageMeta | undefined)[] = [
        meta.main_package,
        ...Object.values(meta.injected_packages ?? {}),
      ];
      for (const entry of entries) {
        if (entry?.package && entry.package_version) {
          snapshot[entry.package] = entry.package_version;
        }
      }
    }
  } catch {
    return {};
  }
  return snapshot;
}

async function snapshot(): Promise<PipxSnapshot> {
  const res = await execCommand('pipx', ['list', '--json'], 30_000);
  if (res.exitCode !== 0) return {};
  return parsePipxList(res.stdout);
}

/**
 * Best-effort listing: pipx cannot tell us the latest version without hitting
 * PyPI, so we surface every managed package as an upgrade candidate (newVersion
 * unknown). reconcile() later confirms which actually changed.
 */
async function listOutdated(): Promise<OutdatedPackage[]> {
  const snap = await snapshot();
  return Object.entries(snap).map(([name, version]) => ({
    name,
    currentVersion: version,
    newVersion: 'latest',
  }));
}

export const pipx: ManagerDescriptor = {
  id: 'pipx',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'pipx', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  // Escape hatch: pipx has no machine-readable "outdated" listing — it cannot
  // know the latest version without querying PyPI. We enumerate every managed
  // package via `pipx list --json` as a candidate, run a single bulk
  // `pipx upgrade-all`, then diff the installed versions before/after; a changed
  // version means that package was upgraded (reconcile derives the verdict).
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando pipx...' };

      const beforeSnap = await snapshot();
      const before: OutdatedPackage[] = Object.entries(beforeSnap).map(([name, version]) => ({
        name,
        currentVersion: version,
        newVersion: 'latest',
      }));
      const commands: CommandRecord[] = [];

      if (before.length) {
        // Single bulk command — pipx upgrades every managed application at once.
        const args = ['upgrade-all'];
        yield { type: 'log', message: `pipx ${args.join(' ')}` };
        const rec = yield* runStream('pipx', args, { timeoutMs: 300_000, sudo: false, signal: ctx.signal });
        commands.push(rec);
        logger.logCommand(rec);
      }

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      // A package is "still outdated" only if its version is UNCHANGED. Anything
      // whose installed version moved is treated as upgraded by reconcile().
      const afterSnap = await snapshot();
      const stillOutdated = before
        .filter(p => afterSnap[p.name] === undefined || afterSnap[p.name] === beforeSnap[p.name])
        .map(p => ({ name: p.name }));

      const result = reconcile(packages, before, { stillOutdated }, commands);
      return result;
    },
  },
};
