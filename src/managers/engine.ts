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
import { ListingUnavailableError, requireListing } from './listing.js';

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
// 10 min default — big upgrades (casks, llvm, OS toolchains) routinely exceed 5
// min. Esc still cancels instantly (the AbortSignal is wired to the child), and
// per-manager overrides live in config.timeoutsMs.
const UPGRADE_TIMEOUT = 600_000;

/**
 * Nothing can be asserted about this manager's run.
 *
 * Sibling of `skippedResult`: the two are the only verdicts the engine authors
 * without a before/after diff, and they sit together so that stays visible.
 */
function undeterminedResult(managerId: string, detail: string): UpgradeResult {
  return {
    success: false,
    upgraded: 0,
    failed: 0,
    errors: [detail],
    skipped: 0,
    status: 'unknown',
    managerId,
  };
}

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
  const ctx = (sudoMode: boolean, signal?: AbortSignal): ManagerCtx => ({
    platform: process.platform,
    sudoMode,
    meta: {},
    signal,
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
      const spec = d.detectCmd;
      const timeoutMs = spec.timeout ?? DETECT_TIMEOUT;
      const startedAt = Date.now();

      if (d.escapeHatch?.detect) {
        const r = await d.escapeHatch.detect(ctx(false));
        logger.logDetect({
          managerId: d.id,
          cmd: `${spec.cmd} ${spec.args.join(' ')}`,
          viaEscapeHatch: true,
          timeoutMs,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          available: r.available,
          version: r.version,
        });
        return { available: r.available, version: r.version };
      }

      const res = await deps.execCommand(spec.cmd, spec.args, timeoutMs, sudoFor(spec, ctx(false)));
      const ok = res.exitCode === 0 || (d.detectOkExitCodes?.includes(res.exitCode) ?? false);
      // Only a failure to launch the binary honestly means "not installed". A
      // timeout, or a probe that ran and answered something the descriptor does
      // not accept, means the probe could not decide — and used to be reported
      // as absent, which is how a five-second timeout read as «no instalado».
      const detection: ManagerDetection = ok
        ? { available: true, version: d.parseVersion?.(res.stdout, res.stderr) }
        : res.spawnFailed
          ? { available: false }
          : { available: false, undetermined: true };
      logger.logDetect({
        managerId: d.id,
        cmd: `${spec.cmd} ${spec.args.join(' ')}`,
        timeoutMs,
        durationMs: Date.now() - startedAt,
        exitCode: res.exitCode,
        available: detection.available,
        undetermined: detection.undetermined === true,
        timedOut: res.timedOut,
        version: detection.version,
      });
      return detection;
    },

    async listOutdated(): Promise<OutdatedPackage[]> {
      const c = ctx(false);
      const startedAt = Date.now();

      if (d.escapeHatch?.listOutdated) {
        const list = await d.escapeHatch.listOutdated(c);
        logger.logScan({
          managerId: d.id,
          cmd: '(escape hatch)',
          timeoutMs: LIST_TIMEOUT,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          count: list.length,
          ok: true,
        });
        return list;
      }

      // A read-only descriptor has nothing to list. Saying so is what keeps
      // "shows no packages" from being indistinguishable from "was never asked".
      if (!d.listOutdatedCmd || !d.parseOutdated) {
        logger.logScan({
          managerId: d.id,
          cmd: '(sin comando de listado)',
          durationMs: Date.now() - startedAt,
          exitCode: null,
          count: 0,
          ok: true,
        });
        return [];
      }

      const spec = d.listOutdatedCmd(c);
      const timeoutMs = spec.timeout ?? LIST_TIMEOUT;
      const res = await deps.execCommand(spec.cmd, spec.args, timeoutMs, sudoFor(spec, c));
      const ok = res.exitCode === 0 || (d.listOkExitCodes?.includes(res.exitCode) ?? false);
      const list = ok ? d.parseOutdated(res.stdout, res.stderr, c) : [];
      logger.logScan({
        managerId: d.id,
        cmd: `${spec.cmd} ${spec.args.join(' ')}`,
        timeoutMs,
        durationMs: Date.now() - startedAt,
        exitCode: res.exitCode,
        count: list.length,
        ok,
        timedOut: res.timedOut,
      });
      requireListing(d.id, res, [0, ...(d.listOkExitCodes ?? [])]);
      return list;
    },

    async *upgrade(
      packages?: string[],
      sudoMode?: boolean,
      signal?: AbortSignal,
    ): AsyncGenerator<ProgressEvent, UpgradeResult> {
      const c = ctx(sudoMode ?? false, signal);
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

      // before-snapshot so verification knows what to diff against. A listing we
      // could not take is survivable ONLY when the caller named the packages: the
      // targets are known, just not their previous versions.
      yield { type: 'phase', phase: 'upgrading', message: `Actualizando ${d.id}...` };
      let before: OutdatedPackage[] = [];
      try {
        before = await this.listOutdated();
      } catch (err) {
        if (!(err instanceof ListingUnavailableError)) throw err;
        if (!packages || packages.length === 0) {
          const r = { ...undeterminedResult(d.id, err.message), startedAt, finishedAt: Date.now() };
          logger.logResult(r);
          return r;
        }
      }
      const target = packages ?? before.map(p => p.name);

      const commands: CommandRecord[] = [];
      const pp: PercentParser | undefined = d.percentParser ? line => d.percentParser!(line, c) : undefined;

      const runOne = async function* (spec: CommandSpec): AsyncGenerator<ProgressEvent, void> {
        yield { type: 'log', message: `${spec.cmd} ${spec.args.join(' ')}` };
        const rec = yield* deps.runStream(
          spec.cmd,
          spec.args,
          { timeoutMs: spec.timeout ?? upgradeTimeout, sudo: sudoFor(spec, c), signal: c.signal },
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

      // after-snapshot → verify. Null means it could not be taken, and reconcile
      // turns that into `unknown` instead of an empty still-outdated list, which
      // would have read as "everything upgraded".
      yield { type: 'phase', phase: 'verifying', message: 'Verificando resultado...' };
      let after: VerifySnapshot | null;
      try {
        after = await verifySnapshot(d, c, deps, this);
      } catch (err) {
        if (!(err instanceof ListingUnavailableError)) throw err;
        after = null;
      }

      const result: UpgradeResult = {
        managerId: d.id,
        startedAt,
        finishedAt: Date.now(),
        ...reconcile(packages, before, after, commands, d.successExitCodes),
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
