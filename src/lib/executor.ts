import { execa, ExecaError } from 'execa';
import type { ProgressEvent } from '../managers/types.js';

const DEFAULT_TIMEOUT = 300_000; // 5 minutos

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Prepara comando con sudo si es necesario */
function withSudo(cmd: string, args: string[], sudo: boolean): [string, string[]] {
  if (!sudo || process.platform === 'win32') return [cmd, args];
  // Si ya somos root (re-exec con sudo), no necesitamos prefixar
  if (process.getuid?.() === 0) return [cmd, args];
  // Fallback: usar -n (non-interactive) para no colgar esperando password
  return ['sudo', ['-n', cmd, ...args]];
}

/** Ejecuta un comando y devuelve stdout/stderr completo */
export async function execCommand(
  cmd: string,
  args: string[],
  timeout = 5_000,
  sudo = false,
): Promise<ExecResult> {
  const [finalCmd, finalArgs] = withSudo(cmd, args, sudo);
  try {
    const result = await execa(finalCmd, finalArgs, {
      timeout,
      reject: false,
      all: false,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err) {
    if (err instanceof ExecaError) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? String(err.message),
        exitCode: err.exitCode ?? 1,
      };
    }
    throw err;
  }
}

/** Ejecuta un comando con streaming de salida como AsyncGenerator */
export async function* execStream(
  cmd: string,
  args: string[],
  timeout = DEFAULT_TIMEOUT,
  sudo = false,
): AsyncGenerator<ProgressEvent, void> {
  const [finalCmd, finalArgs] = withSudo(cmd, args, sudo);
  const child = execa(finalCmd, finalArgs, {
    timeout,
    reject: false,
    stdout: 'pipe',
    stderr: 'pipe',
    all: true,
  });

  // Leer stdout + stderr intercalado para mostrar errores en tiempo real
  if (child.all) {
    for await (const chunk of child.all) {
      const lines = String(chunk).split('\n').filter(Boolean);
      for (const line of lines) {
        const isError = line.toLowerCase().includes('error')
          || line.toLowerCase().includes('permission denied')
          || line.toLowerCase().includes('errno');
        yield { type: isError ? 'error' : 'log', message: line };
      }
    }
  }

  const result = await child;
  if ((result.exitCode ?? 0) !== 0) {
    const stderrMsg = result.stderr?.trim();
    if (stderrMsg) {
      yield { type: 'error', message: stderrMsg };
    } else {
      yield { type: 'error', message: `Exit code: ${result.exitCode}` };
    }
  } else {
    yield { type: 'complete', message: 'OK', percent: 100 };
  }
}
