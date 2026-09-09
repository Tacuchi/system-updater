import { execa, ExecaError } from 'execa';
import type { ProgressEvent } from '../managers/types.js';
import { runStream, withSudo } from './exec/run.js';
import { decodeSmart } from './exec/decode.js';

const DEFAULT_TIMEOUT = 300_000; // 5 minutos

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** The command was killed for exceeding its wait. */
  timedOut: boolean;
  /**
   * The binary could not be launched at all (ENOENT).
   *
   * This is the ONLY failure that honestly means "not installed". Every other
   * one — a timeout, a non-zero answer — means the probe could not decide, and
   * conflating them is how a five-second timeout became «no está instalado».
   */
  spawnFailed: boolean;
}

export { withSudo };

/** ENOENT — the binary is not on PATH, which is the one honest "not installed". */
function isSpawnFailure(r: { code?: unknown; originalMessage?: unknown }): boolean {
  if (r.code === 'ENOENT') return true;
  return typeof r.originalMessage === 'string' && r.originalMessage.includes('ENOENT');
}

/**
 * Ejecuta un comando y devuelve stdout/stderr completo (sin truncar) — usado
 * por detect()/listOutdated() donde la salida completa (p.ej. JSON) importa.
 */
export async function execCommand(
  cmd: string,
  args: string[],
  timeout = 5_000,
  sudo = false,
): Promise<ExecResult> {
  const [finalCmd, finalArgs] = withSudo(cmd, args, sudo);
  try {
    // Capture raw bytes (encoding:'buffer') and sniff-decode — Windows tools emit
    // UTF-16LE (winget) / OEM (cmd-hosted choco/scoop), not UTF-8.
    const result = await execa(finalCmd, finalArgs, {
      timeout,
      reject: false,
      all: false,
      encoding: 'buffer',
    });
    // execa resolves a failed spawn (ENOENT) / signal kill with exitCode
    // undefined; coercing that to 0 would make a MISSING binary look like a
    // successful detection. Treat any failure without a numeric code as non-zero.
    return {
      stdout: decodeSmart(result.stdout as Buffer),
      stderr: decodeSmart(result.stderr as Buffer),
      exitCode: result.exitCode ?? (result.failed ? 127 : 0),
      timedOut: result.timedOut === true,
      spawnFailed: isSpawnFailure(result),
    };
  } catch (err) {
    if (err instanceof ExecaError) {
      return {
        stdout: decodeSmart(err.stdout as Buffer | undefined),
        stderr: decodeSmart(err.stderr as Buffer | undefined) || String(err.message),
        exitCode: err.exitCode ?? 1,
        timedOut: err.timedOut === true,
        spawnFailed: isSpawnFailure(err),
      };
    }
    throw err;
  }
}

/**
 * Wrapper de back-compat sobre runStream: transmite la salida en vivo como
 * ProgressEvents y, al terminar, emite un único 'complete' o 'error' decidido
 * por el EXIT CODE (no por substring-matching). Los managers legacy siguen
 * funcionando hasta que migren a descriptores.
 */
export async function* execStream(
  cmd: string,
  args: string[],
  timeout = DEFAULT_TIMEOUT,
  sudo = false,
): AsyncGenerator<ProgressEvent, void> {
  const gen = runStream(cmd, args, { timeoutMs: timeout, sudo });
  let next = await gen.next();
  while (!next.done) {
    yield next.value;
    next = await gen.next();
  }
  const rec = next.value;
  const failed = rec.timedOut || (rec.exitCode ?? 0) !== 0;
  if (failed) {
    const msg = rec.timedOut
      ? `Timeout tras ${Math.round(rec.durationMs / 1000)}s`
      : rec.stderrTail.trim() || `Exit code: ${rec.exitCode}`;
    yield { type: 'error', message: msg };
  } else {
    yield { type: 'complete', message: 'OK', percent: 100 };
  }
}
