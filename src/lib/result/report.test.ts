import { describe, it, expect } from 'vitest';
import { buildReport } from './report.js';
import type { UpgradeResult } from '../../managers/types.js';

function result(p: Partial<UpgradeResult>): UpgradeResult {
  return { success: true, upgraded: 0, failed: 0, errors: [], ...p };
}

describe('buildReport', () => {
  it('aggregates failures across managers with their kind and package', () => {
    const results: UpgradeResult[] = [
      result({
        managerId: 'brew',
        status: 'success',
        upgraded: 2,
        packages: [
          { name: 'a', outcome: 'upgraded' },
          { name: 'b', outcome: 'upgraded' },
        ],
      }),
      result({
        managerId: 'pip',
        status: 'partial',
        upgraded: 1,
        failed: 1,
        packages: [
          { name: 'requests', outcome: 'upgraded' },
          { name: 'numpy', outcome: 'failed', failureKind: 'COMMAND_FAILED', detail: 'build error' },
        ],
        commands: [
          { cmd: 'pip install -U numpy', exitCode: 1, durationMs: 9, timedOut: false, stdoutTail: '', stderrTail: 'gcc failed' },
        ],
      }),
    ];

    const report = buildReport(results);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      managerId: 'pip',
      package: 'numpy',
      kind: 'COMMAND_FAILED',
      detail: 'build error',
    });
    expect(report.failures[0]?.logExcerpt).toContain('gcc failed');
    expect(report.results).toBe(results);
  });

  it('has no failures when everything succeeded', () => {
    const report = buildReport([result({ managerId: 'npm', status: 'success', upgraded: 1 })]);
    expect(report.failures).toHaveLength(0);
  });

  it('derives the time window from result timestamps', () => {
    const results = [
      result({ managerId: 'a', startedAt: 100, finishedAt: 300 }),
      result({ managerId: 'b', startedAt: 50, finishedAt: 500 }),
    ];
    const report = buildReport(results);
    expect(report.startedAt).toBe(50);
    expect(report.finishedAt).toBe(500);
  });
});
