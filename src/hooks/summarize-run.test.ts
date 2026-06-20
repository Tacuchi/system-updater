import { describe, it, expect } from 'vitest';
import { summarizeRun } from './use-app-machine.js';
import type { AppState } from '../state/types.js';

// summarizeRun only reads state.run.queue + state.managers, so a partial cast is enough.
const make = (managers: Record<string, unknown>, queue: string[]): AppState =>
  ({ run: { queue, doneCount: 0, failedCount: 0, skippedCount: 0 }, managers } as unknown as AppState);

describe('summarizeRun', () => {
  it('aggregates upgraded/failed/skipped across the run queue', () => {
    const state = make(
      {
        brew: { status: 'done', result: { upgraded: 2, failed: 0 } },
        winget: { status: 'failed', result: { upgraded: 1, failed: 1 } },
        choco: { status: 'skipped' },
      },
      ['brew', 'winget', 'choco'],
    );
    expect(summarizeRun(state)).toEqual({
      upgraded: 3,
      failed: 1,
      skipped: 1,
      managers: [
        { id: 'brew', status: 'done', upgraded: 2, failed: 0 },
        { id: 'winget', status: 'failed', upgraded: 1, failed: 1 },
        { id: 'choco', status: 'skipped', upgraded: 0, failed: 0 },
      ],
    });
  });

  it('ignores ids missing from the managers map', () => {
    const state = make({ brew: { status: 'done', result: { upgraded: 1, failed: 0 } } }, ['brew', 'ghost']);
    expect(summarizeRun(state)).toEqual({
      upgraded: 1,
      failed: 0,
      skipped: 0,
      managers: [{ id: 'brew', status: 'done', upgraded: 1, failed: 0 }],
    });
  });
});
