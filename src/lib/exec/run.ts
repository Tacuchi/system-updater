import { execa } from 'execa';
import type { CommandRecord, ProgressEvent } from '../../managers/types.js';
import type { PercentParser } from './percent.js';
import { decodeSmart, StreamDecoder } from './decode.js';

const DEFAULT_TAIL_BYTES = 16384;

export interface RunOptions {
  timeoutMs: number;
  sudo: boolean;
  signal?: AbortSignal;
  cwd?: string;
  env?: Record<string, string>;
  /** Max chars kept from each of stdout/stderr in the CommandRecord. */
  tailBytes?: number;
}

/**
 * Adjust a command for the current privilege context:
 * - sudo + already root → run directly
 * - sudo + not root → prefix `sudo -n` (non-interactive; never hangs on a prompt)
 * - no sudo + root via re-exec → de-escalate to the original user with a login
 *   shell (`sudo -iu`) so brew/gem/pip/runtime managers see their real env/PATH
 * - no sudo + not root → run directly
 */
export function withSudo(cmd: string, args: string[], sudo: boolean): [string, string[]] {
  if (process.platform === 'win32') return [cmd, args];

  const isRoot = process.getuid?.() === 0;
  const originalUser = process.env['SUDO_USER'];

  if (sudo) {
    if (isRoot) return [cmd, args];
    return ['sudo', ['-n', cmd, ...args]];
  }

  if (isRoot && originalUser) {
    return ['sudo', ['-iu', originalUser, cmd, ...args]];
  }

  return [cmd, args];
}

function tail(s: string, bytes: number): string {
  if (!s) return '';
  return s.length > bytes ? s.slice(-bytes) : s;
}

function execaOptions(opts: RunOptions, all: boolean) {
  return {
    timeout: opts.timeoutMs,
    reject: false as const,
    cwd: opts.cwd,
    env: opts.env,
    cancelSignal: opts.signal,
    all,
    // Capture raw bytes; we sniff-decode (UTF-8 / UTF-16LE / OEM) ourselves.
    encoding: 'buffer' as const,
  };
}

/** Run a command to completion, capturing a structured CommandRecord. */
export async function runExec(cmd: string, args: string[], opts: RunOptions): Promise<CommandRecord> {
  const [finalCmd, finalArgs] = withSudo(cmd, args, opts.sudo);
  const tailBytes = opts.tailBytes ?? DEFAULT_TAIL_BYTES;
  const started = Date.now();
  const result = await execa(finalCmd, finalArgs, execaOptions(opts, false));
  return {
    cmd: [finalCmd, ...finalArgs].join(' '),
    exitCode: result.exitCode ?? null,
    durationMs: Date.now() - started,
    timedOut: result.timedOut ?? false,
    stdoutTail: tail(decodeSmart(result.stdout as Buffer | undefined), tailBytes),
    stderrTail: tail(decodeSmart(result.stderr as Buffer | undefined), tailBytes),
  };
}

const WARN_RE = /error|fail|denied|errno|cannot|unable/i;

/**
 * Stream a command's output as ProgressEvents and return a CommandRecord.
 * Error-looking lines get severity:'warn' as a DISPLAY hint only — the verdict
 * comes from the returned record's exit code, never from these lines.
 */
export async function* runStream(
  cmd: string,
  args: string[],
  opts: RunOptions,
  percentParser?: PercentParser,
): AsyncGenerator<ProgressEvent, CommandRecord> {
  const [finalCmd, finalArgs] = withSudo(cmd, args, opts.sudo);
  const tailBytes = opts.tailBytes ?? DEFAULT_TAIL_BYTES;
  const started = Date.now();
  const child = execa(finalCmd, finalArgs, { ...execaOptions(opts, true), stdout: 'pipe', stderr: 'pipe' });

  if (child.all) {
    // Sniff-decode the merged byte stream incrementally (handles UTF-16 units
    // split across chunks) and buffer partial lines until a newline arrives.
    const decoder = new StreamDecoder();
    let lineBuf = '';
    const emit = function* (raw: string): Generator<ProgressEvent> {
      const line = raw.replace(/\r$/, '');
      if (!line) return;
      const percent = percentParser?.(line);
      if (percent !== undefined) {
        yield { type: 'progress', message: line, percent };
      } else {
        yield { type: 'log', message: line, severity: WARN_RE.test(line) ? 'warn' : 'info' };
      }
    };
    for await (const chunk of child.all) {
      lineBuf += decoder.write(chunk as Buffer);
      let nl: number;
      while ((nl = lineBuf.indexOf('\n')) >= 0) {
        const raw = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        yield* emit(raw);
      }
    }
    lineBuf += decoder.end();
    if (lineBuf) yield* emit(lineBuf);
  }

  const result = await child;
  return {
    cmd: [finalCmd, ...finalArgs].join(' '),
    exitCode: result.exitCode ?? null,
    durationMs: Date.now() - started,
    timedOut: result.timedOut ?? false,
    stdoutTail: tail(decodeSmart(result.stdout as Buffer | undefined), tailBytes),
    stderrTail: tail(decodeSmart(result.stderr as Buffer | undefined), tailBytes),
  };
}
