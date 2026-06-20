/**
 * Tiny process-level cancellation registry.
 *
 * The engine's AbortController lives inside the React machine (useAppMachine), but
 * the OS signal handlers live in cli.tsx. This registry bridges them: the machine
 * registers a handler that aborts the active run; cli.tsx fires it from
 * SIGINT/SIGBREAK so Ctrl+C / Ctrl+Break actually cancel the engine (and tree-kill
 * its children) instead of just unmounting Ink and orphaning the install tree.
 */

type CancelHandler = () => void;

const handlers = new Set<CancelHandler>();

/** Register a cancel handler; returns an unregister function. */
export function onProcessCancel(handler: CancelHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Invoke every registered cancel handler (best-effort, never throws). */
export function fireProcessCancel(): void {
  for (const handler of handlers) {
    try {
      handler();
    } catch {
      /* a failing handler must not block the others */
    }
  }
}
