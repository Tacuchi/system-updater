import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

/** name -> installed version, as reported by `bun pm ls -g`. */
export type InstalledMap = Map<string, string>;

/**
 * Parse `bun pm ls -g` output into a name -> version map. Pure + testable.
 *
 * The output is a tree whose first line is the global node_modules path and
 * whose entries look like:
 *   `├── typescript@5.3.3`
 *   `└── @angular/cli@17.0.0`
 * Scoped packages (`@scope/name@ver`) and deep tree connectors (`│`) are
 * handled. The header line (no `@version`) and blanks are skipped.
 */
export function parseBunGlobalList(stdout: string): InstalledMap {
  const map: InstalledMap = new Map();
  for (const raw of stdout.split('\n')) {
    // Strip leading tree-drawing characters / whitespace.
    const line = raw.replace(/^[\s│├└─|`+-]+/u, '').trim();
    if (!line) continue;
    // A package entry is `name@version`; the `@` that splits them is the LAST
    // `@` so scoped names (`@angular/cli@17.0.0`) keep their leading `@`.
    const at = line.lastIndexOf('@');
    if (at <= 0) continue; // header path line, or `@scope` with no version
    const name = line.slice(0, at);
    const version = line.slice(at + 1).split(/\s+/)[0] ?? '';
    // version must look like a real version token, not a path fragment.
    if (!name || !version || !/^\d/.test(version)) continue;
    map.set(name, version);
  }
  return map;
}

/** Read the globally-installed packages map via `bun pm ls -g`. */
async function installed(): Promise<InstalledMap> {
  const res = await execCommand('bun', ['pm', 'ls', '-g'], 30_000);
  if (res.exitCode !== 0) return new Map();
  return parseBunGlobalList(res.stdout + res.stderr);
}

export const bun: ManagerDescriptor = {
  id: 'bun',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'bun', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  manualCommand: () => 'bun update -g',
  // Escape hatch: bun has no machine-readable "outdated" listing for global
  // packages. listOutdated is best-effort and returns [] (we never fabricate an
  // outdated set we cannot honestly compute); the manager still supports a bulk
  // "update everything" via `bun update -g`, deriving a real before/after
  // version diff from `bun pm ls -g` so reconcile reports only packages whose
  // installed version actually changed.
  escapeHatch: {
    async listOutdated(): Promise<OutdatedPackage[]> {
      return [];
    },
    async *upgrade(packages: string[] | undefined, _ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando bun...' };

      const beforeMap = await installed();
      const commands: CommandRecord[] = [];

      // ONE bulk command: `bun update -g` upgrades every global package. When a
      // specific subset is requested, still collapse into a single invocation.
      const args =
        packages && packages.length ? ['update', '-g', ...packages] : ['update', '-g'];
      yield { type: 'log', message: `bun ${args.join(' ')}` };
      const rec = yield* runStream('bun', args, { timeoutMs: 300_000, sudo: false });
      commands.push(rec);
      logger.logCommand(rec);

      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const afterMap = await installed();

      // A package is "outdated/changed" iff its installed version moved. We can
      // only know that for packages present before the upgrade, so build the
      // before-set from the union of (requested ∩ installed) or all installed.
      const candidates =
        packages && packages.length
          ? packages.filter(name => beforeMap.has(name))
          : [...beforeMap.keys()];
      const before: OutdatedPackage[] = candidates.map(name => ({
        name,
        currentVersion: beforeMap.get(name) ?? '?',
        newVersion: afterMap.get(name) ?? beforeMap.get(name) ?? '?',
      }));
      // Still outdated = version unchanged after the bulk update.
      const stillOutdated = candidates
        .filter(name => (afterMap.get(name) ?? beforeMap.get(name)) === beforeMap.get(name))
        .map(name => ({ name }));

      const result = reconcile(packages, before, { stillOutdated }, commands);
      return result;
    },
  },
};
