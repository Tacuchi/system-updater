import type { TerminationMode } from './logger.js';

/**
 * Which OS signals this program answers, and what each one means.
 *
 * A table with the platform injected, for the same reason `shouldUseAscii` takes
 * one: otherwise the Windows branch is only ever exercised on Windows, and the
 * exit route with the least margin — the console window closing — is exactly the
 * one nobody gets to retry.
 *
 * The mode is not cosmetic. Ctrl+C and Ctrl+Break are somebody deciding to stop;
 * SIGHUP (the window closing) and SIGTERM are the environment deciding for them.
 * Only one of the two is a cancellation, and the log has to keep them apart.
 */
export interface SignalRoute {
  signal: NodeJS.Signals;
  /** Conventional exit code for that signal (128 + signal number). */
  code: number;
  mode: TerminationMode;
}

const COMMON: SignalRoute[] = [
  { signal: 'SIGINT', code: 130, mode: 'cancelada' },
  { signal: 'SIGTERM', code: 143, mode: 'interrumpida' },
  // The console window closing. On Windows Node raises it too, with a grace
  // period the OS controls — which is why the closing block is written
  // SYNCHRONOUSLY inside the handler and not after any timer.
  { signal: 'SIGHUP', code: 129, mode: 'interrumpida' },
];

/** Ctrl+Break, which only exists on Windows. */
const WINDOWS_ONLY: SignalRoute[] = [{ signal: 'SIGBREAK', code: 130, mode: 'cancelada' }];

export function signalRoutes(platform: NodeJS.Platform): SignalRoute[] {
  return platform === 'win32' ? [...COMMON, ...WINDOWS_ONLY] : COMMON;
}
