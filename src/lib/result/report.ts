import type { FailureKind, UpgradeResult } from '../../managers/types.js';

export interface FailureEntry {
  managerId: string;
  package?: string;
  kind: FailureKind;
  detail: string;
  logExcerpt: string;
}

export interface SessionReport {
  startedAt: number;
  finishedAt: number;
  results: UpgradeResult[];
  failures: FailureEntry[];
}

function logExcerptFor(r: UpgradeResult): string {
  const tails = (r.commands ?? [])
    .map(c => c.stderrTail?.trim())
    .filter(Boolean) as string[];
  return tails.slice(-1).join('\n');
}

/** Flatten per-manager results into a session-level report for the Summary screen. */
export function buildReport(results: UpgradeResult[]): SessionReport {
  const failures: FailureEntry[] = [];
  for (const r of results) {
    const managerId = r.managerId ?? 'unknown';
    const excerpt = logExcerptFor(r);
    const failedPkgs = (r.packages ?? []).filter(p => p.outcome === 'failed');
    if (failedPkgs.length > 0) {
      for (const p of failedPkgs) {
        failures.push({
          managerId,
          package: p.name,
          kind: p.failureKind ?? r.reason ?? 'UNKNOWN',
          detail: p.detail ?? '',
          logExcerpt: excerpt,
        });
      }
    } else if (r.status === 'failed') {
      // Manager-level failure with no per-package attribution (e.g. readonly w/o sudo).
      failures.push({
        managerId,
        kind: r.reason ?? 'UNKNOWN',
        detail: r.errors[0] ?? '',
        logExcerpt: excerpt,
      });
    }
  }

  const starts = results.map(r => r.startedAt).filter((n): n is number => typeof n === 'number');
  const ends = results.map(r => r.finishedAt).filter((n): n is number => typeof n === 'number');

  return {
    startedAt: starts.length ? Math.min(...starts) : 0,
    finishedAt: ends.length ? Math.max(...ends) : 0,
    results,
    failures,
  };
}
