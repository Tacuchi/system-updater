import path from 'node:path';
import { execa } from 'execa';
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

/**
 * Where an elevated child writes its run summary so the original (non-elevated)
 * process can optionally read it back. `%LOCALAPPDATA%` is per-user and NOT roamed
 * (avoids OneDrive sync churn); falls back to TEMP / cwd off-Windows.
 */
export function elevatedSummaryPath(): string {
  const base = process.env['LOCALAPPDATA'] ?? process.env['TEMP'] ?? process.cwd();
  return path.join(base, 'tacuchi-updater', 'last-run-summary.json');
}

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * Relaunch the updater in a NEW elevated console (a single UAC prompt) via
 * PowerShell `Start-Process -Verb RunAs`. Windows-only. The user completes the run
 * in that elevated window; the caller should then cede control (exit). Returns
 * whether the elevated process was launched (UAC declined / error → false).
 *
 * GATED (Open question #5): the exact ArgumentList round-trip through Start-Process
 * and the summary hand-off via %LOCALAPPDATA% must be validated on real Windows —
 * exit codes/summary do NOT flow back from the new console.
 */
export async function relaunchElevated(extraArgs: string[] = []): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const node = process.execPath; // node.exe
  const script = process.argv[1] ?? ''; // dist/cli.js
  const args = [script, ...process.argv.slice(2), ...extraArgs];
  const argList = args.map(psQuote).join(',');
  const command = `Start-Process -FilePath ${psQuote(node)} -ArgumentList @(${argList}) -Verb RunAs`;
  try {
    const res = await execa('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      reject: false,
    });
    return (res.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}
