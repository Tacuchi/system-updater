import { closeLogger, logRunClosure } from './logger.js';
import type { RunSummaryLog, TerminationMode } from './logger.js';

/**
 * Process-level run settlement.
 *
 * The closing block of the log used to hang off a React effect that fired when
 * the Summary screen rendered, so it existed only if the interface got that far —
 * and no exit path drained the sink anyway. This registry moves the closure to
 * the run's own settlement and makes it reachable from every exit route: the quit
 * key, the OS signals, the non-interactive driver and the hand-off to an elevated
 * console. Sibling of `cancellation.ts`, which bridges the same two worlds for
 * aborting the engine.
 */

type SummaryProvider = () => RunSummaryLog | null;

let provider: SummaryProvider | null = null;
let settled = false;

/**
 * Declare where the closure reads the run's numbers from. The provider is the
 * ENGINE's own accounting, not the UI state: that is what keeps the closing block
 * independent of whether anything was ever rendered.
 */
export function registerRunSummary(fn: SummaryProvider): () => void {
  provider = fn;
  return () => {
    if (provider === fn) provider = null;
  };
}

/**
 * Settle the run ONCE and close the log.
 *
 * Idempotent on purpose: an exit route never has to know whether another one
 * already fired, and the first mode to arrive is the true one — a run cancelled
 * mid-flight must not be relabelled `completa` by the unmount that follows.
 * Returns true when THIS call is the one that wrote the closure.
 */
export function settleRun(mode: TerminationMode, detail?: string): boolean {
  if (settled) return false;
  settled = true;
  let summary: RunSummaryLog | null = null;
  try {
    summary = provider?.() ?? null;
  } catch {
    // A failing provider must not cost us the closure line itself.
    summary = null;
  }
  logRunClosure(mode, summary, detail);
  closeLogger();
  return true;
}

export function isRunSettled(): boolean {
  return settled;
}

/** Tests only: forget the settlement so each case starts from a clean process. */
export function resetRunSettlement(): void {
  settled = false;
  provider = null;
}
