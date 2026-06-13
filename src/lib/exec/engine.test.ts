import { describe, it, expect } from 'vitest';
import { runEngine } from './engine.js';
import type { EngineProgress, EngineTask } from './engine.js';
import type { PackageManager, ProgressEvent, UpgradeResult } from '../../managers/types.js';

interface FakeOpts {
  id: string;
  requiresAdmin?: boolean;
  delayMs?: number;
  events?: ProgressEvent[];
  throws?: boolean;
  tracker?: { admin: number; nonAdmin: number; maxAdmin: number; maxNonAdmin: number };
}

function fakeManager(o: FakeOpts): PackageManager {
  const requiresAdmin = o.requiresAdmin ?? false;
  return {
    id: o.id,
    platforms: ['darwin', 'linux', 'win32'],
    requiresAdmin,
    async detect() {
      return { available: true };
    },
    async listOutdated() {
      return [];
    },
    async *upgrade(): AsyncGenerator<ProgressEvent, UpgradeResult> {
      if (o.tracker) {
        if (requiresAdmin) {
          o.tracker.admin++;
          o.tracker.maxAdmin = Math.max(o.tracker.maxAdmin, o.tracker.admin);
        } else {
          o.tracker.nonAdmin++;
          o.tracker.maxNonAdmin = Math.max(o.tracker.maxNonAdmin, o.tracker.nonAdmin);
        }
      }
      try {
        if (o.throws) throw new Error('kaboom');
        for (const e of o.events ?? []) yield e;
        await new Promise(r => setTimeout(r, o.delayMs ?? 5));
        return { success: true, upgraded: 1, failed: 0, errors: [], status: 'success', managerId: o.id };
      } finally {
        if (o.tracker) {
          if (requiresAdmin) o.tracker.admin--;
          else o.tracker.nonAdmin--;
        }
      }
    },
  };
}

function tasks(...ms: PackageManager[]): EngineTask[] {
  return ms.map(m => ({ manager: m, op: 'upgrade' as const }));
}

const baseOpts = {
  concurrency: 4,
  sudoMode: false,
  timeoutsMs: {},
  onEvent: () => {},
};

describe('runEngine', () => {
  it('runs every task and returns results in task order', async () => {
    const results = await runEngine(tasks(fakeManager({ id: 'a' }), fakeManager({ id: 'b' })), {
      ...baseOpts,
      signal: new AbortController().signal,
    });
    expect(results.map(r => r.managerId)).toEqual(['a', 'b']);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('never exceeds the concurrency limit for non-admin tasks', async () => {
    const tracker = { admin: 0, nonAdmin: 0, maxAdmin: 0, maxNonAdmin: 0 };
    const ms = Array.from({ length: 6 }, (_, i) => fakeManager({ id: `m${i}`, tracker, delayMs: 10 }));
    await runEngine(tasks(...ms), { ...baseOpts, concurrency: 2, signal: new AbortController().signal });
    expect(tracker.maxNonAdmin).toBeLessThanOrEqual(2);
  });

  it('serializes admin tasks (only one at a time)', async () => {
    const tracker = { admin: 0, nonAdmin: 0, maxAdmin: 0, maxNonAdmin: 0 };
    const ms = Array.from({ length: 3 }, (_, i) =>
      fakeManager({ id: `adm${i}`, requiresAdmin: true, tracker, delayMs: 10 }),
    );
    await runEngine(tasks(...ms), { ...baseOpts, concurrency: 4, signal: new AbortController().signal });
    expect(tracker.maxAdmin).toBe(1);
  });

  it('emits queued and done events with the final result', async () => {
    const seen: EngineProgress[] = [];
    await runEngine(tasks(fakeManager({ id: 'a' })), {
      ...baseOpts,
      signal: new AbortController().signal,
      onEvent: e => seen.push(e),
    });
    expect(seen.some(e => e.phase === 'queued' && e.managerId === 'a')).toBe(true);
    const done = seen.find(e => e.phase === 'done');
    expect(done?.result?.success).toBe(true);
  });

  it('forwards progress events from the manager', async () => {
    const seen: EngineProgress[] = [];
    await runEngine(
      tasks(fakeManager({ id: 'a', events: [{ type: 'log', message: 'hi' }] })),
      { ...baseOpts, signal: new AbortController().signal, onEvent: e => seen.push(e) },
    );
    expect(seen.some(e => e.event?.message === 'hi')).toBe(true);
  });

  it('captures a throwing manager as a failed result without aborting the pool', async () => {
    const results = await runEngine(
      tasks(fakeManager({ id: 'bad', throws: true }), fakeManager({ id: 'good' })),
      { ...baseOpts, signal: new AbortController().signal },
    );
    const bad = results.find(r => r.managerId === 'bad');
    const good = results.find(r => r.managerId === 'good');
    expect(bad?.success).toBe(false);
    expect(bad?.status).toBe('failed');
    expect(good?.success).toBe(true);
  });

  it('returns cancelled results when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const results = await runEngine(tasks(fakeManager({ id: 'a' })), { ...baseOpts, signal: ac.signal });
    expect(results[0]?.status).toBe('cancelled');
  });
});
