import { runExec } from './run.js';
import { once } from './capabilities.js';

export type SudoStatus = 'available' | 'needs-password' | 'no-sudo';

const NO_SUDO_RE = /ENOENT|command not found|not recognized|no such file/i;

/** Pure classification of a `sudo -n true` probe result. */
export function classifySudoProbe(rec: { exitCode: number | null; stderrTail: string }): SudoStatus {
  if (rec.exitCode === 0) return 'available';
  if (NO_SUDO_RE.test(rec.stderrTail)) return 'no-sudo';
  // sudo exists but didn't authenticate non-interactively → a password is needed.
  return 'needs-password';
}

/**
 * Probe once whether passwordless sudo is available, so the engine can fail all
 * admin managers fast with a single clear NO_PASSWORDLESS_SUDO message instead
 * of letting each one hit the password wall silently. Windows has no sudo.
 */
export function probePasswordlessSudo(): Promise<SudoStatus> {
  return once('sudo:passwordless', async () => {
    if (process.platform === 'win32') return 'no-sudo';
    const rec = await runExec('sudo', ['-n', 'true'], { timeoutMs: 5000, sudo: false });
    return classifySudoProbe(rec);
  });
}
