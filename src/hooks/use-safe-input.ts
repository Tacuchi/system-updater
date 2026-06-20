import { useInput, useStdin } from 'ink';

type InputHandler = Parameters<typeof useInput>[0];
type InputOptions = NonNullable<Parameters<typeof useInput>[1]>;

/**
 * `useInput` that no-ops when raw mode is unsupported.
 *
 * Ink's `useInput` calls `process.stdin.setRawMode(true)` on mount and THROWS
 * "Raw mode is not supported on the current process.stdin" when stdin is not a
 * TTY (piped input, Git Bash/MinTTY, CI). Gating it on `isRawModeSupported`
 * (= `stdin.isTTY`) makes the app degrade to the non-interactive flow instead of
 * crashing at startup. With `isActive:false`, Ink early-returns before touching
 * raw mode, so the hook is still called unconditionally (Rules of Hooks).
 */
export function useSafeInput(handler: InputHandler, options?: InputOptions): void {
  const { isRawModeSupported } = useStdin();
  const active = (options?.isActive ?? true) && isRawModeSupported;
  useInput(handler, { ...options, isActive: active });
}
