import React from 'react';
import { render } from 'ink';
import { execaSync } from 'execa';
import App from './app.js';
import { isElevated } from './lib/elevation.js';
import { fireProcessCancel } from './lib/cancellation.js';
import { getVersion } from './lib/version.js';

const args = process.argv.slice(2);
const sudoRequested = args.includes('--sudo') || args.includes('-s');
const isRoot = process.getuid?.() === 0;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  @tacuchi/updater — CLI para actualizar gestores de paquetes

  Uso:
    updater              Modo normal (sin permisos de admin)
    updater --sudo       Ejecutar con permisos de administrador
    updater --help       Mostrar esta ayuda

  Flags:
    -s, --sudo           Permite actualizar gestores que requieren admin
                         (softwareupdate, apt, dnf, pacman, snap)
    -y, --yes, --all     Modo no-interactivo: actualiza todo sin teclado
                         (automático cuando stdin no es un TTY / CI / pipe)
    -h, --help           Mostrar ayuda
    -v, --version        Mostrar versión

  Tip: ejecuta siempre la última versión con  npx @tacuchi/updater@latest
  `);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(getVersion());
  process.exit(0);
}

// Re-lanzar el proceso completo bajo sudo si fue solicitado y no somos root.
// Esto resuelve el problema de tty_tickets en macOS: el prompt de password
// aparece ANTES de que Ink tome el terminal, y todos los subprocesos
// corren como root sin necesitar sudo individualmente.
if (sudoRequested && !isRoot && process.platform !== 'win32') {
  console.log('\x1b[35m» Modo SUDO: ingresa tu contraseña para continuar...\x1b[0m');
  try {
    const scriptPath = process.argv[1] ?? '';
    const isDevMode = scriptPath.endsWith('.tsx') || scriptPath.endsWith('.ts');
    const restArgs = process.argv.slice(2);

    // Dev (.tsx): necesita tsx loader, pasar PATH para que npx/tsx se encuentren
    // Prod (.js): node ejecuta el JS compilado directamente
    const sudoArgs = isDevMode
      ? ['env', `PATH=${process.env['PATH'] ?? ''}`, 'npx', 'tsx', scriptPath, ...restArgs]
      : [process.execPath, scriptPath, ...restArgs];

    const result = execaSync('sudo', sudoArgs, {
      stdio: 'inherit',
      reject: false,
    });
    process.exit(result.exitCode ?? 0);
  } catch {
    console.error('\x1b[31m✗ No se pudo autenticar sudo. Continuando sin permisos elevados.\x1b[0m');
  }
}

// Detect real elevation. On Windows this is an Administrator console (is-admin) —
// NOT --sudo, which cannot elevate there. Detecting it is what makes choco run when
// elevated instead of being skipped unconditionally (bug #1). On unix, elevated ==
// root (post re-exec), with --sudo still allowing a passwordless `sudo -n` attempt.
const elevated = await isElevated();
if (process.platform === 'win32' && sudoRequested && !elevated) {
  console.log(
    '\x1b[33m» En Windows --sudo no eleva. Abrí la terminal como Administrador (se detecta automáticamente).\x1b[0m',
  );
}
const sudoMode = process.platform === 'win32' ? elevated : isRoot || sudoRequested;

// Non-interactive: no usable TTY (piped stdin, Git Bash/MinTTY, CI) or an explicit
// --yes/--all. The app then drives Detect→Update→Summary without keypresses instead
// of crashing on raw-mode (see useSafeInput + the non-interactive driver).
const nonInteractive =
  !process.stdin.isTTY || args.includes('--yes') || args.includes('-y') || args.includes('--all');

const { unmount } = render(<App sudoMode={sudoMode} nonInteractive={nonInteractive} />);

// Cancel the active run (abort → tree-kill the child process tree) BEFORE unmounting,
// so Ctrl+C / Ctrl+Break never orphan a winget/choco install tree (bug #2). A short
// grace period lets tree-kill (taskkill /T /F on Windows) actually run.
const onSignal =
  (code: number): (() => void) =>
  () => {
    fireProcessCancel();
    setTimeout(() => {
      unmount();
      process.exit(code);
    }, 200);
  };

process.on('SIGINT', onSignal(130));
process.on('SIGTERM', onSignal(143));
process.on('SIGBREAK', onSignal(130)); // Windows Ctrl+Break
