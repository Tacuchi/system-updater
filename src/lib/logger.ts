import fs from 'fs';
import path from 'path';
import { getConfigDir } from './config.js';
import type { CommandRecord, UpgradeResult } from '../managers/types.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error' | 'success';
  message: string;
}

let configLogPath: string | null = null;
let localLogPath: string | null = null;
let configStream: fs.WriteStream | null = null;
let localStream: fs.WriteStream | null = null;

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

  // Log en directorio de config del usuario (~/.tacuchi-updater/logs/)
  const configLogsDir = path.join(getConfigDir(), 'logs');
  const config = createStream(configLogsDir, filename);
  configStream = config.stream;
  configLogPath = config.filePath;

  // Log local en ./logs/ del proyecto (para debug en desarrollo)
  const localLogsDir = path.join(process.cwd(), 'logs');
  try {
    const local = createStream(localLogsDir, filename);
    localStream = local.stream;
    localLogPath = local.filePath;
    // Si falla al escribir (ej: root creó el dir y ahora corremos como user), no crashear
    localStream.on('error', () => {
      localStream = null;
      localLogPath = null;
    });
  } catch {
    // Si no se puede crear el directorio/archivo, continuar solo con config
  }

  writeRaw('INFO', 'Logger iniciado — @tacuchi/updater');
  writeRaw('INFO', `Log config: ${configLogPath}`);
  if (localLogPath) writeRaw('INFO', `Log local:  ${localLogPath}`);
  writeRaw('INFO', `PID: ${process.pid} | UID: ${process.getuid?.() ?? 'N/A'} | SUDO_USER: ${process.env['SUDO_USER'] ?? 'N/A'}`);
  writeRaw('INFO', `Platform: ${process.platform} | Node: ${process.version}`);
  return localLogPath ?? configLogPath;
}

function writeRaw(level: LogLevel, message: string): void {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
  const line = `${timestamp} [${level.padEnd(5)}] SystemUpdater - ${message}\n`;
  configStream?.write(line);
  localStream?.write(line);
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

/** Log the classified outcome of a manager upgrade. */
export function logResult(r: UpgradeResult): void {
  const id = r.managerId ?? '?';
  const ok = r.status === 'success' || r.status === 'noop';
  const level: LogLevel = ok ? 'INFO' : r.status === 'partial' ? 'WARN' : 'ERROR';
  const reason = r.reason ? ` reason=${r.reason}` : '';
  writeRaw(level, `${id}: status=${r.status} upgraded=${r.upgraded} failed=${r.failed}${reason}`);
  for (const e of r.errors) writeRaw(level, `  ${id}: ${e}`);
  const memLevel: LogEntry['level'] = ok ? 'info' : r.status === 'partial' ? 'warn' : 'error';
  addToMemory(memLevel, `${id}: ${r.status} (${r.upgraded} ok, ${r.failed} fail)`);
}

export function getLogEntries(): LogEntry[] {
  return [...inMemoryLog];
}

export function getLogFilePath(): string | null {
  return localLogPath ?? configLogPath;
}

export function closeLogger(): void {
  configStream?.end();
  localStream?.end();
  configStream = null;
  localStream = null;
}
