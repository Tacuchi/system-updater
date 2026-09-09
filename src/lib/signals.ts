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
 *
 * KNOWN LIMIT, and it is documented as impossible rather than pending: logging
 * off, restarting or shutting down Windows delivers NO signal here. libuv maps
 * only CTRL_CLOSE_EVENT to SIGHUP and ignores CTRL_LOGOFF_EVENT and
 * CTRL_SHUTDOWN_EVENT outright, and `node.exe` links user32 — which per
 * SetConsoleCtrlHandler means the handler is not called for those two events at
 * all. A run ended by a shutdown therefore has no closing line, and no amount of
 * testing will change that: it needs a different mechanism (a per-line
 * write-ahead log), not better evidence.
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

/**
 * How long to wait before exiting, so the cancellation's process kill gets to
 * run. Well inside the 5000 ms Windows gives a close handler.
 */
export const SIGNAL_GRACE_MS = 200;

/** The four effects answering a signal needs, injected so the ORDER is testable. */
export interface SignalEffects {
  settle(mode: TerminationMode, detail: string): void;
  cancel(): void;
  unmount(): void;
  exit(code: number): void;
  schedule(fn: () => void, ms: number): void;
}

/**
 * Answer one signal — and the ORDER here is the whole point.
 *
 * 1. The closure FIRST. Cancelling spawns a process (tree-kill runs
 *    `taskkill /pid X /T /F` on win32 and `pgrep` on darwin), and a spawn ahead
 *    of the one line that has to survive spends the OS's grace period before a
 *    single byte is on disk. The write measures 0.08 ms.
 * 2. Then cancel, so no child is orphaned.
 * 3. Then exit, after a grace period — and the exit CANNOT depend on unmount():
 *    Microsoft documents that console functions may not work reliably while a
 *    close event is handled, and libuv parks the handler thread in
 *    Sleep(INFINITE), so a throwing unmount would hang the process until Windows
 *    killed it and the exit code would stop being the signal's.
 *
 * It lives here, and not in the entry point, because a module with top-level
 * side effects is a module no test can import — and this order is exactly the
 * thing worth a test.
 */
export function answerSignal(route: SignalRoute, effects: SignalEffects): void {
  effects.settle(route.mode, `señal ${route.signal}`);
  effects.cancel();
  effects.schedule(() => {
    try {
      effects.unmount();
    } catch {
      /* console I/O is unreliable while a close event is being handled */
    }
    effects.exit(route.code);
  }, SIGNAL_GRACE_MS);
}
