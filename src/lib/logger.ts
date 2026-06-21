import fs from 'fs';
import path from 'path';
import { getLogDir } from './config.js';
import type { CommandRecord, UpgradeResult } from '../managers/types.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error' | 'success';
  message: string;
}

let logFilePath: string | null = null;
let logStream: fs.WriteStream | null = null;

const inMemoryLog: LogEntry[] = [];
let entryCounter = 0;

function createStream(dir: string, filename: string): { stream: fs.WriteStream; filePath: string } {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' });
  return { stream, filePath };
}

export function initLogger(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[T:]/g, '_').split('.')[0]?.replace(/-/g, '');
  const filename = `system_updater_${stamp}.log`;

  // Single sink in the user's log dir (win32: %LOCALAPPDATA%, unix: ~/.tacuchi-updater/logs).
  // The previous second sink under process.cwd()/logs polluted whatever directory the
  // CLI was launched from and could EPERM; it has been removed.
  try {
    const { stream, filePath } = createStream(getLogDir(), filename);
    logStream = stream;
    logFilePath = filePath;
    logStream.on('error', () => {
      logStream = null;
    });
  } catch {
    // Logging is best-effort; never crash the app because a log file can't be opened.
    logStream = null;
    logFilePath = null;
  }

  writeRaw('INFO', 'Logger iniciado — @tacuchi/updater');
  writeRaw('INFO', `Log: ${logFilePath ?? '(no disponible)'}`);
  writeRaw(
    'INFO',
    `PID: ${process.pid} | UID: ${process.getuid?.() ?? 'N/A'} | SUDO_USER: ${process.env['SUDO_USER'] ?? 'N/A'}`,
  );
  writeRaw('INFO', `Platform: ${process.platform} | Node: ${process.version}`);
  return logFilePath ?? '';
}

function writeRaw(level: LogLevel, message: string): void {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
  const line = `${timestamp} [${level.padEnd(5)}] SystemUpdater - ${message}\n`;
  logStream?.write(line);
}

function addToMemory(level: LogEntry['level'], message: string): void {
  const id = String(++entryCounter);
  const timestamp = new Date().toLocaleTimeString('es-MX', { hour12: false });
  inMemoryLog.push({ id, timestamp, level, message });
  // mantener máx 200 entradas en memoria
  if (inMemoryLog.length > 200) inMemoryLog.shift();
}

export function log(message: string): void {
  writeRaw('INFO', message);
  addToMemory('info', message);
}

export function debug(message: string): void {
  writeRaw('DEBUG', message);
  addToMemory('debug', message);
}

export function warn(message: string): void {
  writeRaw('WARN', message);
  addToMemory('warn', message);
}

export function error(message: string): void {
  writeRaw('ERROR', message);
  addToMemory('error', message);
}

export function success(message: string): void {
  writeRaw('INFO', `[OK] ${message}`);
  addToMemory('success', message);
}

/**
 * Log a shell command with its exit code, duration and output tails. This is
 * the command-level observability that was previously missing entirely — it
 * makes "why did this fail" answerable from the log file alone.
 */
export function logCommand(rec: CommandRecord): void {
  const status = rec.timedOut ? 'TIMEOUT' : `exit=${rec.exitCode ?? 'null'}`;
  writeRaw('DEBUG', `$ ${rec.cmd} → ${status} (${rec.durationMs}ms)`);
  if (rec.stdoutTail.trim()) writeRaw('DEBUG', `  stdout: ${rec.stdoutTail.trim()}`);
  if ((rec.exitCode ?? 0) !== 0 && rec.stderrTail.trim()) {
    writeRaw('WARN', `  stderr: ${rec.stderrTail.trim()}`);
  }
  addToMemory('debug', `$ ${rec.cmd} (${status})`);
}

/**
 * Pure: format a manager's result into plain-text log lines — the status verdict,
 * its real duration, and a line per package (name + version delta + outcome).
 * Exported so it's testable without touching the file stream.
 */
export function formatResultLines(r: UpgradeResult): string[] {
  const id = r.managerId ?? '?';
  const reason = r.reason ? ` reason=${r.reason}` : '';
  const reboot = r.reboot ? ` reboot=${r.reboot}` : '';
  const lines = [`${id}: status=${r.status} upgraded=${r.upgraded} failed=${r.failed}${reason}${reboot}`];
  if (r.startedAt !== undefined && r.finishedAt !== undefined) {
    lines.push(`  ${id}: duration=${r.finishedAt - r.startedAt}ms`);
  }
  for (const p of r.packages ?? []) {
    const ver = p.fromVersion || p.toVersion ? ` ${p.fromVersion ?? '?'}->${p.toVersion ?? '?'}` : '';
    lines.push(`  ${id}: ${p.name}${ver} [${p.outcome}]`);
  }
  return lines;
}

/** Log the classified outcome of a manager upgrade (verdict + duration + packages). */
export function logResult(r: UpgradeResult): void {
  const id = r.managerId ?? '?';
  const ok = r.status === 'success' || r.status === 'noop';
  const level: LogLevel = ok ? 'INFO' : r.status === 'partial' ? 'WARN' : 'ERROR';
  for (const line of formatResultLines(r)) writeRaw(level, line);
  for (const e of r.errors) writeRaw(level, `  ${id}: ${e}`);
  const memLevel: LogEntry['level'] = ok ? 'info' : r.status === 'partial' ? 'warn' : 'error';
  addToMemory(memLevel, `${id}: ${r.status} (${r.upgraded} ok, ${r.failed} fail)`);
}

/** Minimal shape of a run summary the logger needs (a superset is accepted). */
export interface RunSummaryLog {
  upgraded: number;
  failed: number;
  skipped: number;
  managers: { id: string; status: string; upgraded: number; failed: number; durationMs?: number }[];
}

/** Pure: format the end-of-run summary block (plain text, no JSON). Testable. */
export function formatRunSummary(s: RunSummaryLog): string[] {
  const lines = ['──── Resumen del run ────'];
  for (const m of s.managers) {
    const dur = m.durationMs !== undefined ? ` ${m.durationMs}ms` : '';
    lines.push(`  ${m.id}: ${m.status} (${m.upgraded} ok, ${m.failed} fail)${dur}`);
  }
  lines.push(`Total: ${s.upgraded} upgraded · ${s.failed} failed · ${s.skipped} skipped`);
  return lines;
}

/** Append the run-summary block to the log file (and one concise memory entry). */
export function logRunSummary(s: RunSummaryLog): void {
  for (const line of formatRunSummary(s)) writeRaw('INFO', line);
  addToMemory('info', `Resumen: ${s.upgraded} ok · ${s.failed} fail · ${s.skipped} skip`);
}

export function getLogEntries(): LogEntry[] {
  return [...inMemoryLog];
}

export function getLogFilePath(): string | null {
  return logFilePath;
}

export function closeLogger(): void {
  logStream?.end();
  logStream = null;
}
