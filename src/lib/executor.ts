import { execa, ExecaError } from 'execa';
import type { ProgressEvent } from '../managers/types.js';

const DEFAULT_TIMEOUT = 300_000; // 5 minutos

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Ajusta el comando según el contexto de permisos:
 * - sudo=true + ya somos root → ejecutar directo (ya tenemos permisos)
 * - sudo=true + no root → prefixar con sudo -n
 * - sudo=false + somos root (por re-exec) → de-escalar al usuario original
 *   para que detect/listOutdated vean el entorno correcto del usuario
 * - sudo=false + no root → ejecutar directo
 */
function withSudo(cmd: string, args: string[], sudo: boolean): [string, string[]] {
  if (process.platform === 'win32') return [cmd, args];

  const isRoot = process.getuid?.() === 0;
  const originalUser = process.env['SUDO_USER'];

  if (sudo) {
    if (isRoot) return [cmd, args];
    return ['sudo', ['-n', cmd, ...args]];
  }

  // De-escalar: si corremos como root por re-exec, ejecutar como el usuario original
  // para que brew, gem, pip, etc. vean su entorno real.
  // -i: simula login completo (carga .zshrc/.bashrc → inicializa RVM, NVM, pyenv, etc.)
  // -u: ejecuta como el usuario original
  if (isRoot && originalUser) {
    return ['sudo', ['-iu', originalUser, cmd, ...args]];
  }

  return [cmd, args];
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
