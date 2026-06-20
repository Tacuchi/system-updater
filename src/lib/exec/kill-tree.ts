import treeKill from 'tree-kill';

/**
 * Kill a process AND its entire child tree.
 *
 * execa's `cancelSignal` only sends SIGTERM to the *direct* child. On Windows
 * SIGTERM is not a real signal and grandchildren (a `winget`/`choco` upgrade
 * spawns `msiexec`/installers) survive Esc/Ctrl+C — bug #2. `tree-kill` walks the
 * tree: on win32 it runs `taskkill /pid <pid> /T /F` (force, whole tree); on unix
 * it signals the process group. Best-effort: a dead/missing pid is ignored.
 */
export function killTree(pid: number | undefined, signal: string = 'SIGTERM'): void {
  if (!pid) return;
  try {
    treeKill(pid, signal, () => {
      /* swallow — the child may already be gone */
    });
  } catch {
    /* best-effort */
  }
}
