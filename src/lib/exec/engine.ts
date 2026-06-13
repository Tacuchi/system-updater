import type { ManagerPhase, PackageManager, ProgressEvent, UpgradeResult } from '../../managers/types.js';

export interface EngineTask {
  manager: PackageManager;
  packages?: string[];
  op: 'upgrade' | 'uninstall';
}

export interface EngineProgress {
  managerId: string;
  phase: ManagerPhase;
  event?: ProgressEvent;
  result?: UpgradeResult;
}

export interface EngineOptions {
  /** Across non-admin managers. Admin managers always run serially (dpkg/rpm locks). */
  concurrency: number;
  signal: AbortSignal;
  sudoMode: boolean;
  timeoutsMs: Record<string, number>;
  onEvent: (e: EngineProgress) => void;
}

function cancelledResult(managerId: string): UpgradeResult {
  return {
    success: false,
    upgraded: 0,
    failed: 0,
    errors: ['cancelado'],
    status: 'cancelled',
    reason: 'CANCELLED',
    managerId,
    skipped: 0,
  };
}

function failedResult(managerId: string, message: string): UpgradeResult {
  return {
    success: false,
    upgraded: 0,
    failed: 1,
    errors: [message],
    status: 'failed',
    reason: 'UNKNOWN',
    managerId,
  };
}

async function runTask(task: EngineTask, opts: EngineOptions): Promise<UpgradeResult> {
  const managerId = task.manager.id;
  opts.onEvent({ managerId, phase: 'queued' });

  if (opts.signal.aborted) {
    const r = cancelledResult(managerId);
    opts.onEvent({ managerId, phase: 'done', result: r });
    return r;
  }

  opts.onEvent({ managerId, phase: 'upgrading' });
  try {
    const gen =
      task.op === 'uninstall' && task.manager.uninstall
        ? task.manager.uninstall(task.packages ?? [], opts.sudoMode)
        : task.manager.upgrade(task.packages, opts.sudoMode, opts.signal);

    let next = await gen.next();
    while (!next.done) {
      opts.onEvent({ managerId, phase: 'upgrading', event: next.value });
      next = await gen.next();
    }
    const result: UpgradeResult = { managerId, ...next.value };
    opts.onEvent({ managerId, phase: 'done', result });
    return result;
  } catch (err) {
    const r = failedResult(managerId, String(err));
    opts.onEvent({ managerId, phase: 'done', result: r });
    return r;
  }
}

/** Bounded promise pool: pulls indices off a shared cursor. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await worker(item);
    }
  };
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, () => run()));
}

/**
 * Schedule upgrade/uninstall tasks across managers with bounded concurrency.
 * Non-admin tasks run in a pool of `concurrency`; admin tasks run in a separate
 * serial lane (one at a time) to avoid dpkg/rpm lock contention and interleaved
 * sudo prompts. Results are returned in the original task order.
 */
export async function runEngine(tasks: EngineTask[], opts: EngineOptions): Promise<UpgradeResult[]> {
  const results = new Array<UpgradeResult>(tasks.length);
  const indexed = tasks.map((task, index) => ({ task, index }));
  const adminLane = indexed.filter(t => t.task.manager.requiresAdmin);
  const fastLane = indexed.filter(t => !t.task.manager.requiresAdmin);

  await Promise.all([
    pool(fastLane, opts.concurrency, async ({ task, index }) => {
      results[index] = await runTask(task, opts);
    }),
    pool(adminLane, 1, async ({ task, index }) => {
      results[index] = await runTask(task, opts);
    }),
  ]);

  return results;
}
