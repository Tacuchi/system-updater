import fs from 'fs';
import path from 'path';
import { getConfigDir } from './config.js';
import type { LogEntry } from '../components/log-stream.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

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
