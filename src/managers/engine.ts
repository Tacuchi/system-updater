import type {
  CommandRecord,
  ManagerDetection,
  OutdatedPackage,
  PackageManager,
  ProgressEvent,
  UpgradeResult,
  VerifySnapshot,
} from './types.js';
import type { CommandSpec, ManagerCtx, ManagerDescriptor } from './descriptor.js';
import type { UserConfig } from '../lib/config.js';
import type { PercentParser } from '../lib/exec/percent.js';
import { execCommand as realExecCommand } from '../lib/executor.js';
import type { ExecResult } from '../lib/executor.js';
import { runStream as realRunStream } from '../lib/exec/run.js';
import { reconcile } from '../lib/result/verify.js';
import * as logger from '../lib/logger.js';

/** Injectable I/O surface so the engine is unit-testable without spawning. */
export interface ExecDeps {
  execCommand(cmd: string, args: string[], timeout?: number, sudo?: boolean): Promise<ExecResult>;
  runStream(
    cmd: string,
    args: string[],
    opts: { timeoutMs: number; sudo: boolean; signal?: AbortSignal },
    percentParser?: PercentParser,
  ): AsyncGenerator<ProgressEvent, CommandRecord>;
}

const defaultDeps: ExecDeps = { execCommand: realExecCommand, runStream: realRunStream };

const DETECT_TIMEOUT = 5_000;
const LIST_TIMEOUT = 30_000;
const UPGRADE_TIMEOUT = 300_000;

function skippedResult(managerId: string, manualCommand: string): UpgradeResult {
  return {
    success: false,
    upgraded: 0,
    failed: 0,
    errors: [],
    skipped: 1,
    status: 'noop',
    manualCommand,
    managerId,
  };
}

/**
 * Build a PackageManager from a declarative descriptor. This is the ONLY place
 * an UpgradeResult is constructed — via reconcile() over a real before/after
 * diff — so no descriptor can fabricate success. Special cases plug in through
 * descriptor.escapeHatch.
 */
export function fromDescriptor(d: ManagerDescriptor, cfg: UserConfig, deps: ExecDeps = defaultDeps): PackageManager {
  const ctx = (sudoMode: boolean): ManagerCtx => ({
    platform: process.platform,
    sudoMode,
    meta: {},
  });

  const upgradeTimeout = cfg.timeoutsMs[d.id] ?? d.defaultTimeoutMs ?? UPGRADE_TIMEOUT;

  function sudoFor(spec: CommandSpec, c: ManagerCtx): boolean {
    return spec.sudo ?? (d.requiresAdmin ? c.sudoMode : false);
  }

  const manager: PackageManager = {
    id: d.id,
    platforms: d.platforms,
    requiresAdmin: d.requiresAdmin,
    group: d.group,
    defaultTimeoutMs: d.defaultTimeoutMs,

    async detect(): Promise<ManagerDetection> {
      if (d.escapeHatch?.detect) {
        const r = await d.escapeHatch.detect(ctx(false));
        return { available: r.available, version: r.version };
      }
      const spec = d.detectCmd;
      const res = await deps.execCommand(spec.cmd, spec.args, spec.timeout ?? DETECT_TIMEOUT, sudoFor(spec, ctx(false)));
      const ok = res.exitCode === 0 || (d.detectOkExitCodes?.includes(res.exitCode) ?? false);
      if (!ok) return { available: false };
      return { available: true, version: d.parseVersion?.(res.stdout, res.stderr) };
    },

    async listOutdated(): Promise<OutdatedPackage[]> {
      const c = ctx(false);
      if (d.escapeHatch?.listOutdated) return d.escapeHatch.listOutdated(c);
      if (!d.listOutdatedCmd || !d.parseOutdated) return [];
      const spec = d.listOutdatedCmd(c);
      const res = await deps.execCommand(spec.cmd, spec.args, spec.timeout ?? LIST_TIMEOUT, sudoFor(spec, c));
      const ok = res.exitCode === 0 || (d.listOkExitCodes?.includes(res.exitCode) ?? false);
      if (!ok) return [];
      return d.parseOutdated(res.stdout, res.stderr, c);
    },

    async *upgrade(packages?: string[], sudoMode?: boolean): AsyncGenerator<ProgressEvent, UpgradeResult> {
      const c = ctx(sudoMode ?? false);
      const startedAt = Date.now();

      if (d.escapeHatch?.upgrade) {
        const r = yield* d.escapeHatch.upgrade(packages, c);
        // The engine owns the verdict log so managerId is always present
        // (escape hatches build their result via reconcile(), which has no id).
        const result: UpgradeResult = { managerId: d.id, startedAt, finishedAt: Date.now(), ...r };
        logger.logResult(result);
        return result;
      }

      const manual = d.manualCommand?.(c) ?? '';
      if (d.kind === 'readonly' || (d.requiresAdmin && !c.sudoMode)) {
        yield { type: 'log', message: manual ? `Comando manual: ${manual}` : 'Requiere permisos de administrador.' };
        const r = skippedResult(d.id, manual);
        logger.logResult(r);
        return { ...r, startedAt, finishedAt: Date.now() };
      }

      // before-snapshot so verification knows what to diff against.
      yield { type: 'phase', phase: 'upgrading', message: `Actualizando ${d.id}...` };
      const before = await this.listOutdated();
      const target = packages ?? before.map(p => p.name);

      const commands: CommandRecord[] = [];
      const pp: PercentParser | undefined = d.percentParser ? line => d.percentParser!(line, c) : undefined;

      const runOne = async function* (spec: CommandSpec): AsyncGenerator<ProgressEvent, void> {
        yield { type: 'log', message: `${spec.cmd} ${spec.args.join(' ')}` };
        const rec = yield* deps.runStream(
          spec.cmd,
          spec.args,
          { timeoutMs: spec.timeout ?? upgradeTimeout, sudo: sudoFor(spec, c) },
          pp,
        );
        commands.push(rec);
        logger.logCommand(rec);
      };

      if (!d.upgradeCmd) {
        const r: UpgradeResult = {
          success: false, upgraded: 0, failed: 0, errors: ['Sin comando de actualización'],
          status: 'failed', reason: 'UNKNOWN', managerId: d.id, startedAt, finishedAt: Date.now(),
        };
        logger.logResult(r);
        return r;
      }
      for (const spec of d.preUpgradeCmds?.(c) ?? []) yield* runOne(spec);
      yield* runOne(d.upgradeCmd(target.length ? target : undefined, c));
      for (const spec of d.postUpgradeCmds?.(c) ?? []) yield* runOne(spec);

      // after-snapshot → verify.
      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      const after = await verifySnapshot(d, c, deps, this);

      const result: UpgradeResult = {
        managerId: d.id,
        startedAt,
        finishedAt: Date.now(),
        ...reconcile(packages, before, after, commands),
      };
      logger.logResult(result);
      return result;
    },
  };

  if (d.verify || d.escapeHatch) {
    manager.verify = async (requested?: string[]) => verifySnapshot(d, ctx(false), deps, manager, requested);
  }

  return manager;
}

async function verifySnapshot(
  d: ManagerDescriptor,
  c: ManagerCtx,
  deps: ExecDeps,
  manager: PackageManager,
  _requested?: string[],
): Promise<VerifySnapshot> {
  if (d.verify) {
    const spec = d.verify.cmd(c);
    const res = await deps.execCommand(spec.cmd, spec.args, spec.timeout ?? LIST_TIMEOUT, spec.sudo ?? false);
    return { stillOutdated: d.verify.parseStillOutdated(res.stdout, res.stderr, c).map(name => ({ name })) };
  }
  const still = await manager.listOutdated();
  return { stillOutdated: still.map(p => ({ name: p.name, currentVersion: p.currentVersion, newVersion: p.newVersion })) };
}
