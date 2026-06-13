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
    async *upgrade(packages: string[] | undefined, _ctx: ManagerCtx): AsyncGenerator<ProgressEvent, UpgradeResult> {
      const cmd = pipCmd();
      yield { type: 'phase', phase: 'upgrading', message: 'Actualizando pip...' };
      const flags = await pep668Flags();
      if (flags.length) yield { type: 'log', message: 'Entorno PEP 668: usando --break-system-packages' };

      const before = await listOutdated();
      const target = packages && packages.length ? packages : before.map(p => p.name);
      const commands: CommandRecord[] = [];

      if (target.length) {
        const args = ['install', '--user', '--upgrade', ...flags, ...target];
        yield { type: 'log', message: `${cmd} ${args.join(' ')}` };
        const rec = yield* runStream(cmd, args, { timeoutMs: 300_000, sudo: false });
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
