import isAdmin from 'is-admin';

/**
 * Whether the current process runs with elevated privileges.
 *
 * - **Windows:** there is no `sudo`. Elevation means an *Administrator* console,
 *   which `process.getuid` cannot see (it is undefined on win32). `is-admin`
 *   probes it properly (via `net session`/`fltmc`). Detecting this is what lets
 *   admin-only managers (choco) actually run when elevated instead of being
 *   skipped unconditionally — the core of bug #1.
 * - **Unix:** elevated == running as root (`getuid() === 0`), e.g. after the
 *   `--sudo` re-exec.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      return await isAdmin();
    } catch {
      return false;
    }
  }
  return process.getuid?.() === 0;
}
