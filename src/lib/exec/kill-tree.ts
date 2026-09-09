import treeKill from 'tree-kill';

/**
 * Kill a process AND its entire child tree.
 *
 * Signalling only the direct child is not enough: on Windows SIGTERM is not a
 * real signal and grandchildren (a `winget`/`choco` upgrade spawns
 * `msiexec`/installers) survive Esc/Ctrl+C — bug #2. `tree-kill` walks the tree:
 * on win32 it runs `taskkill /pid <pid> /T /F` (force, whole tree); on unix it
 * signals the process group. This is the ONLY thing that cancels a run's children
 * (see `attachTreeKill`), so a failure to walk the tree falls back to the pid we
 * know. Best-effort: a dead/missing pid is ignored.
 */
export function killTree(pid: number | undefined, signal: string = 'SIGTERM'): void {
  if (!pid) return;
  try {
    treeKill(pid, signal, err => {
      if (!err) return;
      // tree-kill needs `ps` on unix and `taskkill` on Windows. When it could not
      // walk the tree at all, the process we DO know about must still not
      // survive — nothing else cancels it now.
      try {
        process.kill(pid, signal as NodeJS.Signals);
      } catch {
        /* already gone */
      }
    });
  } catch {
    /* best-effort */
  }
}
