import type { ManagerDescriptor, ManagerCtx } from '../descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from '../types.js';
import { execCommand } from '../../lib/executor.js';
import { runStream } from '../../lib/exec/run.js';
import { once } from '../../lib/exec/capabilities.js';
import { reconcile } from '../../lib/result/verify.js';
import * as logger from '../../lib/logger.js';

interface PipOutdatedEntry {
  name: string;
  version: string;
  latest_version: string;
}

export function pipCmd(): string {
  return process.platform === 'win32' ? 'pip' : 'pip3';
}

/**
 * Build the pip invocation for an UPGRADE: prefer `python -m pip`, fall back to
 * the bare `pip`/`pip3` shim when no interpreter is found.
 *
 * pip refuses to upgrade ITSELF when launched through the `pip`/`pip.exe` shim —
 * it prints "To modify pip, please run: <python> -m pip install ..." and exits 1.
 * On Windows the running `pip.exe` is file-locked, so a bulk `pip install
 * --upgrade <pkgs incl. pip>` aborts the WHOLE batch and every package gets
 * reported as COMMAND_FAILED, even the ones unrelated to pip. Running pip as a
 * module makes the interpreter (not the shim) the live process, so pip can
 * replace its own files — exactly what pip's own error message recommends.
 */
export function pipInvocation(python: string | null): { cmd: string; baseArgs: string[] } {
  return python ? { cmd: python, baseArgs: ['-m', 'pip'] } : { cmd: pipCmd(), baseArgs: [] };
}

/** Resolve, once per session, a Python interpreter able to run `python -m pip`. */
async function pythonModuleCmd(): Promise<string | null> {
  return once('pip:python', async () => {
    const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
    for (const c of candidates) {
      const probe = await execCommand(c, ['-m', 'pip', '--version'], 5000);
      if (probe.exitCode === 0) return c;
    }
    return null;
  });
}

/** Parse `pip list --outdated --format=json`. Pure + testable. */
export function parsePipOutdated(stdout: string): OutdatedPackage[] {
  try {
    const data = JSON.parse(stdout) as PipOutdatedEntry[];
    return data.map(p => ({ name: p.name, currentVersion: p.version, newVersion: p.latest_version }));
  } catch {
    return [];
  }
}

/** Detect a PEP 668 (externally-managed) environment once per session. */
async function pep668Flags(): Promise<string[]> {
  return once('pip:pep668', async () => {
    const cmd = pipCmd();
    const probe = await execCommand(cmd, ['install', '--user', '--dry-run', 'pip'], 5000);
    const managed = (probe.stdout + probe.stderr).includes('externally-managed');
    return managed ? ['--break-system-packages'] : [];
  });
}

async function listOutdated(): Promise<OutdatedPackage[]> {
  const res = await execCommand(pipCmd(), ['list', '--outdated', '--format=json'], 30_000);
  if (res.exitCode !== 0) return [];
  return parsePipOutdated(res.stdout);
}

export const pip: ManagerDescriptor = {
  id: 'pip',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: pipCmd(), args: ['--version'], timeout: 3000 },
  parseVersion: stdout => stdout.match(/pip (\S+)/)?.[1],
  listOutdatedCmd: () => ({ cmd: pipCmd(), args: ['list', '--outdated', '--format=json'] }),
  parseOutdated: stdout => parsePipOutdated(stdout),
  // Escape hatch: pip needs a cached PEP 668 probe and a single bulk install
  // (the old code looped one `pip install` per package — the main slowness).
  escapeHatch: {
    listOutdated,
    async *upgrade(packages: string[] | undefined, ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando pip...' };
      const flags = await pep668Flags();
      if (flags.length) yield { type: 'log', message: 'Entorno PEP 668: usando --break-system-packages' };

      // Upgrade via `python -m pip` so pip can self-upgrade without the shim
      // self-modification refusal that otherwise fails the whole batch.
      const { cmd, baseArgs } = pipInvocation(await pythonModuleCmd());

      const before = await listOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        const args = [...baseArgs, 'install', '--user', '--upgrade', ...flags, ...target];
        yield { type: 'log', message: `${cmd} ${args.join(' ')}` };
        const rec = yield* runStream(cmd, args, { timeoutMs: 300_000, sudo: false, signal: ctx.signal });
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
