import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

// asdf is a multi-runtime version manager. It has no machine-readable
// "outdated" listing, so we derive it ourselves: enumerate installed plugins,
// read each plugin's installed versions, and compare the highest installed
// version against `asdf latest <plugin>` (the latest stable available).

/**
 * The manual command shown on upgrade. asdf has no single bulk-upgrade
 * command — installing the latest of each plugin is inherently multi-step
 * (`asdf install <plugin> latest` then re-point the version), so we surface a
 * manual recipe instead of fabricating a one-shot upgrade.
 */
const MANUAL_COMMAND = 'asdf latest --all && asdf install';

/** Parse `asdf plugin list` — one plugin name per line. Pure + testable. */
export function parsePlugins(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Parse `asdf list <plugin>` — installed versions, one per line, indented and
 * with the active version prefixed by `*`. Returns the bare version strings in
 * the order asdf printed them. Pure + testable.
 *
 * Example output:
 * ```
 *   1.20.4
 *  *1.21.0
 * ```
 * When no versions are installed asdf prints a notice on stderr and nothing on
 * stdout, so an empty/whitespace stdout yields `[]`.
 */
export function parseInstalledVersions(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(l => l.replace(/^\s*\*?\s*/, '').trim())
    .filter(Boolean)
    .filter(l => !/^no versions installed/i.test(l));
}

/**
 * Parse `asdf latest <plugin>` — the single latest stable version string.
 * Pure + testable. Returns undefined when asdf emitted no usable version
 * (e.g. an unknown plugin or an error message).
 */
export function parseLatest(stdout: string): string | undefined {
  const line = stdout
    .split('\n')
    .map(l => l.trim())
    .find(Boolean);
  if (!line) return undefined;
  // A version must contain at least one digit; reject error banners.
  return /\d/.test(line) ? line : undefined;
}

/**
 * Compare an installed version against the latest available one. asdf version
 * strings are heterogeneous across plugins, so we compare the leading numeric
 * dotted segments and treat any trailing difference as "different". Pure +
 * testable. Returns true when `latest` is newer than (or differs from)
 * `installed`.
 */
export function isOutdated(installed: string, latest: string): boolean {
  if (installed === latest) return false;
  const seg = (v: string): number[] =>
    (v.match(/^\d+(?:\.\d+)*/)?.[0] ?? '').split('.').filter(Boolean).map(Number);
  const a = seg(installed);
  const b = seg(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (bi > ai) return true;
    if (bi < ai) return false;
  }
  // Numeric prefixes are equal but the full strings differ → treat as outdated
  // only when latest is a non-empty, different stable string.
  return false;
}

/** Highest installed version for a plugin, or undefined when none installed. */
function highestInstalled(versions: string[]): string | undefined {
  if (!versions.length) return undefined;
  return versions.reduce((best, v) => (isOutdated(best, v) ? v : best));
}

async function plugins(): Promise<string[]> {
  return once('asdf:plugins', async () => {
    const res = await execCommand('asdf', ['plugin', 'list'], 10_000);
    if (res.exitCode !== 0) return [];
    return parsePlugins(res.stdout);
  });
}

async function installedVersions(plugin: string): Promise<string[]> {
  const res = await execCommand('asdf', ['list', plugin], 10_000);
  if (res.exitCode !== 0) return [];
  return parseInstalledVersions(res.stdout);
}

async function latestVersion(plugin: string): Promise<string | undefined> {
  return once(`asdf:latest:${plugin}`, async () => {
    const res = await execCommand('asdf', ['latest', plugin], 15_000);
    if (res.exitCode !== 0) return undefined;
    return parseLatest(res.stdout);
  });
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  const names = await plugins();
  const out: OutdatedPackage[] = [];
  for (const plugin of names) {
    const installed = await installedVersions(plugin);
    const current = highestInstalled(installed);
    if (!current) continue;
    const latest = await latestVersion(plugin);
    if (!latest) continue;
    if (isOutdated(current, latest)) {
      out.push({ name: plugin, currentVersion: current, newVersion: latest });
    }
  }
  return out;
}

export const asdf: ManagerDescriptor = {
  id: 'asdf',
  group: 'sdk',
  platforms: ['darwin', 'linux'],
  requiresAdmin: false,
  kind: 'direct',
  defaultTimeoutMs: 600_000,
  detectCmd: { cmd: 'asdf', args: ['--version'], timeout: 5000 },
  // `asdf --version` prints e.g. `v0.14.0-abc1234` or `0.14.0`.
  parseVersion: stdout => stdout.trim().replace(/^v/, '') || undefined,
  manualCommand: () => MANUAL_COMMAND,
  // Escape hatch: asdf has no machine-readable "outdated". listOutdated derives
  // it by comparing each plugin's highest installed version against
  // `asdf latest <plugin>` (lookups cached via once). There is no single bulk
  // command to upgrade everything — installing the latest of each plugin is
  // inherently multi-step — so upgrade surfaces a manualCommand + noop rather
  // than fabricating success.
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, _ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando asdf...' };

      const before = await listOutdated();
      const commands: CommandRecord[] = [];

      if (!before.length) {
        // Nothing detected as outdated → honest no-op.
        const result = reconcile(packages, before, { stillOutdated: [] }, commands);
        return result;
      }

      // asdf cannot upgrade all plugins in one bulk command. Surface the manual
      // recipe and report a no-op — never claim an upgrade we did not perform.
      yield { type: 'log', message: `Comando manual: ${MANUAL_COMMAND}` };
      const result: UpgradeResult = {
        success: false,
        upgraded: 0,
        failed: 0,
        errors: [],
        skipped: before.length,
        status: 'noop',
        manualCommand: MANUAL_COMMAND,
        managerId: 'asdf',
        commands,
        packages: before.map(p => ({
          name: p.name,
          outcome: 'skipped' as const,
          fromVersion: p.currentVersion,
          toVersion: p.newVersion,
        })),
      };
      return result;
    },
  },
};
