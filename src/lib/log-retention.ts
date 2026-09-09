import fs from 'node:fs';
import path from 'node:path';

/**
 * Bound the log deposit by RUN COUNT, not by age.
 *
 * By count because the real corpus comes in bursts: dozens of runs in one day
 * and then nothing for weeks, so "keep the last 15 days" either throws away a
 * whole afternoon of evidence or keeps nothing at all. The deposit had grown to
 * 121 files since March with no bound.
 *
 * And it never claims to have deleted what it could not: 49 of those files
 * belonged to root, from elevated runs, so an unelevated prune trips over them.
 * They are reported ONCE, with the command that removes them.
 */

/**
 * The injected file surface. `listFiles` returns bare NAMES (it is a readdir);
 * `mtimeMs` and `remove` take full paths, because that is what they are given.
 * `pruneLogs` owns the join, so the deps stay a thin mirror of `fs`.
 */
export interface RetentionDeps {
  listFiles(dir: string): string[];
  mtimeMs(file: string): number;
  remove(file: string): void;
}

export interface RetentionReport {
  kept: number;
  removed: number;
  /** Files this process is not allowed to remove, with the reason. */
  unremovable: { file: string; reason: string }[];
}

export const defaultRetentionDeps: RetentionDeps = {
  listFiles: dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.log')) : []),
  mtimeMs: file => fs.statSync(file).mtimeMs,
  remove: file => fs.unlinkSync(file),
};

/** A refusal by the OS, as opposed to a file that simply is not there any more. */
function isPermissionDenied(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EACCES' || code === 'EPERM';
}

/**
 * Keep the `keep` newest runs and remove the rest.
 *
 * Ordering is by mtime and not by filename: a name is a convention and a
 * timestamp in it can be rewritten, while what "the most recent runs" means is a
 * fact about the files.
 */
export function pruneLogs(
  dir: string,
  keep: number,
  deps: RetentionDeps = defaultRetentionDeps,
): RetentionReport {
  const limit = Math.max(1, Math.floor(keep));
  const report: RetentionReport = { kept: 0, removed: 0, unremovable: [] };

  let files: string[];
  try {
    files = deps.listFiles(dir);
  } catch {
    return report;
  }

  const dated = files
    .map(f => {
      const full = path.join(dir, f);
      try {
        return { full, mtime: deps.mtimeMs(full) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { full: string; mtime: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime);

  report.kept = Math.min(dated.length, limit);
  for (const entry of dated.slice(limit)) {
    try {
      deps.remove(entry.full);
      report.removed += 1;
    } catch (err) {
      if (isPermissionDenied(err)) {
        report.unremovable.push({ file: entry.full, reason: 'sin permiso' });
      }
      // A file that vanished between the listing and the removal is not a
      // problem worth reporting: somebody else already did the work.
    }
  }
  return report;
}

/**
 * What to say about the files this process could not remove — and the cause is
 * NOT the same on every system.
 *
 * On unix it is ownership: an elevated run leaves root-owned logs behind, and the
 * fix is a command the user can run. On Windows an elevated console runs as the
 * SAME user, so ownership is never the reason; a refusal there means the file is
 * locked (antivirus, OneDrive, a reader), and there is no command to hand over —
 * offering `sudo` would be advice for a machine the user is not on.
 */
export function unremovableReport(
  files: string[],
  platform: NodeJS.Platform,
): { reason: string; command: string | null } | null {
  if (files.length === 0) return null;
  if (platform === 'win32') {
    return { reason: 'bloqueado(s) por otro proceso', command: null };
  }
  return {
    reason: 'de otro dueño',
    command: `sudo rm -f ${files.map(f => `'${f}'`).join(' ')}`,
  };
}
