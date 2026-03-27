import React from 'react';
import { render } from 'ink';
import { execaSync } from 'execa';
import App from './app.js';

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
    -h, --help           Mostrar ayuda
    -v, --version        Mostrar versión
  `);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('1.0.0');
  process.exit(0);
}

// En Windows, sudo no aplica — informar al usuario
if (sudoRequested && process.platform === 'win32') {
  console.log('\x1b[33m⟩ En Windows, ejecuta la terminal como Administrador en vez de usar --sudo\x1b[0m');
}

// Re-lanzar el proceso completo bajo sudo si fue solicitado y no somos root.
// Esto resuelve el problema de tty_tickets en macOS: el prompt de password
// aparece ANTES de que Ink tome el terminal, y todos los subprocesos
// corren como root sin necesitar sudo individualmente.
if (sudoRequested && !isRoot && process.platform !== 'win32') {
  console.log('\x1b[35m⟩ Modo SUDO: ingresa tu contraseña para continuar...\x1b[0m');
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

const sudoMode = isRoot || sudoRequested;

const { unmount } = render(<App sudoMode={sudoMode} />);

process.on('SIGINT', () => {
  unmount();
  process.exit(0);
});

process.on('SIGTERM', () => {
  unmount();
  process.exit(0);
});
