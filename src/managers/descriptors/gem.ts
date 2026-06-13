import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

// Ruby introspection that lists user-installed gems living in the active
// GEM_HOME. Excludes default gems (embedded in the runtime) and bundled gems
// (not in GEM_HOME) so `gem outdated` noise for unmanageable gems is dropped.
const USER_GEMS_RUBY =
  'puts Gem::Specification.select{|s| !s.default_gem? && s.base_dir == Gem.dir}.map(&:name).join("\n")';

/**
 * Parse `gem outdated` lines, keeping only gems present in `userGems` (the set of
 * user-installed gems in the active GEM_HOME). Pure + testable.
 *
 * A line looks like: `rails (7.0.0 < 7.1.0)`.
 */
export function parseGemOutdated(stdout: string, userGems: ReadonlySet<string>): OutdatedPackage[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line): OutdatedPackage | null => {
      const match = line.match(/^(\S+)\s+\(([^<]+)<\s+([^)]+)\)/);
      if (!match) return null;
      const name = match[1] ?? '';
      // Only include gems the user installed into the active GEM_HOME.
      if (!userGems.has(name)) return null;
      return {
        name,
        currentVersion: match[2]?.trim() ?? '?',
        newVersion: match[3]?.trim() ?? '?',
      };
    })
    .filter((x): x is OutdatedPackage => x !== null);
}

/** Parse the names emitted by the user-gems ruby introspection. Pure + testable. */
export function parseUserGems(stdout: string): Set<string> {
  return new Set(
    stdout
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean),
  );
}

/** Cache the (expensive) ruby introspection once per process run. */
async function userGems(): Promise<Set<string>> {
  return once('gem:userGems', async () => {
    const res = await execCommand('ruby', ['-e', USER_GEMS_RUBY], 5000);
    return parseUserGems(res.stdout);
  });
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  const res = await execCommand('gem', ['outdated'], 30_000);
  if (res.exitCode !== 0) return [];
  return parseGemOutdated(res.stdout, await userGems());
}

/**
 * Build the bulk `gem update` args, honoring the legacy GEM_HOME/sudo logic:
 * - sudo → `gem update` (writes to the system GEM_HOME under sudo)
 * - custom GEM_HOME (RVM/rbenv) → `gem update` (already user-writable; adding
 *   --user-install would target ~/.gem which is a different dir and fails)
 * - otherwise → `gem update --user-install`
 */
function updateArgs(packages: string[] | undefined, useSudo: boolean): string[] {
  const hasCustomGemHome = !!process.env['GEM_HOME'];
  const baseArgs = useSudo || hasCustomGemHome ? ['update'] : ['update', '--user-install'];
  return packages && packages.length ? [...baseArgs, ...packages] : baseArgs;
}

export const gem: ManagerDescriptor = {
  id: 'gem',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'gem', args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.trim() || undefined,
  // Escape hatch: listOutdated needs `ruby -e` introspection (cached) to filter
  // to user gems in the active GEM_HOME; upgrade is a single bulk `gem update`
  // that honors GEM_HOME/sudo (the legacy code already did one bulk command).
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      const useSudo = ctx.sudoMode;
      yield { type: 'phase', phase: 'upgrading', message: `Actualizando gem...${useSudo ? ' (sudo)' : ''}` };

      const before = await listOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        const args = updateArgs(target, useSudo);
        yield { type: 'log', message: `${useSudo ? 'sudo ' : ''}gem ${args.join(' ')}` };
        const rec = yield* runStream('gem', args, { timeoutMs: 300_000, sudo: useSudo, signal: ctx.signal });
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
