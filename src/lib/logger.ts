import fs from 'fs';
import path from 'path';
import { getConfigDir } from './config.js';
import type { LogEntry } from '../components/log-stream.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

let logFilePath: string | null = null;
let logStream: fs.WriteStream | null = null;

const inMemoryLog: LogEntry[] = [];
let entryCounter = 0;

export function initLogger(): string {
  const logsDir = path.join(getConfigDir(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[T:]/g, '_').split('.')[0]?.replace(/-/g, '');
  const filename = `system_updater_${stamp}.log`;
  logFilePath = path.join(logsDir, filename);

  logStream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf-8' });
  writeRaw('INFO', 'Logger iniciado — @tacuchi/updater');
  return logFilePath;
}

function writeRaw(level: LogLevel, message: string): void {
  if (!logStream) return;
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
  const line = `${timestamp} [${level.padEnd(5)}] SystemUpdater - ${message}\n`;
  logStream.write(line);
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
