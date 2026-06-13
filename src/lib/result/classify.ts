import type { CommandRecord, FailureKind } from '../../managers/types.js';

const SUDO_PASSWORD_RE = /a (terminal|password) is required|sudo:.*password|askpass/i;
const NETWORK_RE =
  /could not resolve host|network is unreachable|temporary failure in name resolution|connection timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|\bTLS\b|certificate/i;

/**
 * Classify the outcome of a single shell command. Exit code is authoritative;
 * stderr patterns only refine the *kind* of a failure. Returns null when the
 * command is considered successful.
 *
 * Cancellation (AbortSignal) is decided by the engine, not here — a cancelled
 * command has no distinguishing CommandRecord field.
 */
export function classifyCommand(rec: CommandRecord, successExitCodes?: number[]): FailureKind | null {
  if (rec.timedOut) return 'TIMEOUT';

  const ok = rec.exitCode === 0 || (successExitCodes?.includes(rec.exitCode ?? -1) ?? false);
  if (ok) return null;

  const stderr = rec.stderrTail ?? '';
  if (SUDO_PASSWORD_RE.test(stderr)) return 'NO_PASSWORDLESS_SUDO';
  if (NETWORK_RE.test(stderr)) return 'NETWORK';
  return 'COMMAND_FAILED';
}
