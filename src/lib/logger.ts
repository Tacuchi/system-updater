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
let logFd: number | null = null;

const inMemoryLog: LogEntry[] = [];
let entryCounter = 0;

/**
 * Append-mode file descriptor, written with `fs.writeSync`.
 *
 * It used to be an `fs.WriteStream`, which buffers: none of the process' exit
 * paths ever drained it, so a run could finish its work and lose the tail of its
 * own log — which is how three of nine real runs ended with per-manager verdicts
 * and no closing block. A synchronous append has nothing to drain: every line is
 * on disk the moment it is written, whichever way the process then dies.
 */
function openLog(dir: string, filename: string): { fd: number; filePath: string } {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  return { fd: fs.openSync(filePath, 'a'), filePath };
}

export function initLogger(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[T:]/g, '_').split('.')[0]?.replace(/-/g, '');
  const filename = `system_updater_${stamp}.log`;

  // Single sink in the user's log dir (win32: %LOCALAPPDATA%, unix: ~/.tacuchi-updater/logs).
  // The previous second sink under process.cwd()/logs polluted whatever directory the
  // CLI was launched from and could EPERM; it has been removed.
  try {
    const { fd, filePath } = openLog(getLogDir(), filename);
    logFd = fd;
    logFilePath = filePath;
  } catch {
    // Logging is best-effort; never crash the app because a log file can't be opened.
    logFd = null;
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
  if (logFd === null) return;
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
  const line = `${timestamp} [${level.padEnd(5)}] SystemUpdater - ${message}\n`;
  try {
    // writeSync is allowed to write FEWER bytes than asked, and a command tail
    // can be 16 KB. Looping is what makes "no emitted line is lost" true rather
    // than usually true.
    const bytes = new TextEncoder().encode(line);
    let written = 0;
    while (written < bytes.length) {
      written += fs.writeSync(logFd, bytes.subarray(written));
    }
  } catch {
    // A dead descriptor must never crash the app — stop writing to it instead.
    logFd = null;
  }
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
 * A presence probe, as the log records it.
 *
 * `exitCode` is null when a descriptor's escape hatch ran the probe: those own
 * their own commands and there is no single exit code to report. Saying `n/d`
 * is the point — the alternative was coercing it to 0, which is how a missing
 * binary starts looking like a successful detection.
 */
export interface DetectRecord {
  managerId: string;
  cmd: string;
  timeoutMs?: number;
  durationMs: number;
  exitCode: number | null;
  available: boolean;
  version?: string;
  /** The descriptor ran its own probe, so `cmd` is the declared one, not the run one. */
  viaEscapeHatch?: boolean;
}

/** An outdated-package listing, as the log records it. */
export interface ScanRecord {
  managerId: string;
  cmd: string;
  timeoutMs?: number;
  durationMs: number;
  exitCode: number | null;
  count: number;
  /** Whether the listing itself succeeded — `npm outdated` exits 1 on success. */
  ok: boolean;
}

function exitOf(code: number | null): string {
  return code === null ? 'exit=n/d' : `exit=${code}`;
}

function waitOf(timeoutMs: number | undefined): string {
  return timeoutMs === undefined ? '' : ` timeout=${timeoutMs}ms`;
}

/** Pure: the line a presence probe leaves. */
function formatDetectLine(r: DetectRecord): string {
  const verdict = r.available ? `disponible${r.version ? ` version=${r.version}` : ''}` : 'ausente';
  return `${r.managerId}: detect cmd="${r.cmd}"${waitOf(r.timeoutMs)} ${exitOf(r.exitCode)} (${r.durationMs}ms) → ${verdict}`;
}

/** Pure: the line an outdated listing leaves. */
function formatScanLine(r: ScanRecord): string {
  const verdict = r.ok ? `pendientes=${r.count}` : 'listado fallido';
  return `${r.managerId}: scan cmd="${r.cmd}"${waitOf(r.timeoutMs)} ${exitOf(r.exitCode)} (${r.durationMs}ms) → ${verdict}`;
}

/**
 * Record a presence probe.
 *
 * Until now the log jumped straight from its header to the first upgrade
 * command: nineteen probes and ten listings happened in between and left not one
 * line, so "brew is not installed" and "the probe timed out" read identically.
 */
export function logDetect(r: DetectRecord): void {
  const line = formatDetectLine(r);
  writeRaw('DEBUG', line);
  addToMemory('debug', line);
}

/** Record an outdated listing. */
export function logScan(r: ScanRecord): void {
  const line = formatScanLine(r);
  writeRaw('DEBUG', line);
  addToMemory('debug', line);
}

/** What the run offered against what the user chose to upgrade. */
export interface SelectionRecord {
  offered: number;
  chosen: number;
  managers: { id: string; offered: number; chosen: number }[];
}

/**
 * Pure: the offered-vs-chosen block.
 *
 * Without it a run that upgraded one of forty-three pending packages looks
 * identical to one that had a single package to begin with.
 */
function formatSelectionLines(s: SelectionRecord): string[] {
  const lines = [`Selección: ofrecidos=${s.offered} elegidos=${s.chosen}`];
  for (const m of s.managers) lines.push(`  ${m.id}: ofrecidos=${m.offered} elegidos=${m.chosen}`);
  return lines;
}

/** Record what was offered against what was chosen, at the moment of confirming. */
export function logSelection(s: SelectionRecord): void {
  for (const line of formatSelectionLines(s)) writeRaw('INFO', line);
  addToMemory('info', `Selección: ${s.chosen} de ${s.offered}`);
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

export function getLogEntries(): LogEntry[] {
  return [...inMemoryLog];
}

export function getLogFilePath(): string | null {
  return logFilePath;
}

/**
 * Close the sink. After this, `writeRaw` is inert — which is what makes the
 * closing block the last line of the file BY CONSTRUCTION instead of by luck.
 */
export function closeLogger(): void {
  if (logFd === null) return;
  try {
    fs.closeSync(logFd);
  } catch {
    /* the descriptor may already be gone */
  }
  logFd = null;
}

/** How a run ended. Every exit route of the process declares exactly one of these. */
export type TerminationMode = 'completa' | 'cancelada' | 'interrumpida' | 'fallida' | 'cedida';

/**
 * Pure: the closing block of a run — its summary when there is one, then the line
 * that says HOW the run ended. Exported so it is testable without a file.
 */
export function formatRunClosure(
  mode: TerminationMode,
  summary: RunSummaryLog | null,
  detail?: string,
): string[] {
  const lines = summary ? formatRunSummary(summary) : [];
  lines.push(`Cierre del run: modo=${mode}${detail ? ` (${detail})` : ''}`);
  return lines;
}

/** Append the closing block to the log file (and one concise memory entry). */
export function logRunClosure(
  mode: TerminationMode,
  summary: RunSummaryLog | null,
  detail?: string,
): void {
  for (const line of formatRunClosure(mode, summary, detail)) writeRaw('INFO', line);
  addToMemory('info', `Cierre del run: ${mode}`);
}
