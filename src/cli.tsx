import React from 'react';
import { Writable } from 'node:stream';
import { loadConfig } from './lib/config.js';
import { setLanguage, t } from './i18n/index.js';
import { setTerminalTheme } from './theme.js';
import { probeTerminal } from './lib/terminal-theme.js';
import { bannerBlocker, deleteImage, pickImageId, pickPiece, transmitImage } from './lib/terminal-image.js';
import { configureBanner, retireBanner } from './lib/banner.js';
import { ASCII } from './lib/glyphs.js';
import { render } from 'ink';
import { execaSync } from 'execa';
import App from './app.js';
import { isElevated } from './lib/elevation.js';
import { fireProcessCancel } from './lib/cancellation.js';
import { getVersion } from './lib/version.js';
import { settleRun } from './lib/run-closure.js';
import { answerSignal, signalRoutes } from './lib/signals.js';

setLanguage(loadConfig().language);

const args = process.argv.slice(2);
const sudoRequested = args.includes('--sudo') || args.includes('-s');
const isRoot = process.getuid?.() === 0;

if (args.includes('--help') || args.includes('-h')) {
  console.log(t('cli', 'help'));
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
  console.log(t('cli', 'sudoPrompt'));
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
    console.error(t('cli', 'sudoFailure'));
  }
}

// Detect real elevation. On Windows this is an Administrator console (is-admin) —
// NOT --sudo, which cannot elevate there. Detecting it is what makes choco run when
// elevated instead of being skipped unconditionally (bug #1). On unix, elevated ==
// root (post re-exec), with --sudo still allowing a passwordless `sudo -n` attempt.
const elevated = await isElevated();
if (process.platform === 'win32' && sudoRequested && !elevated) {
  console.log(
    t('cli', 'windowsAdmin'),
  );
}
const sudoMode = process.platform === 'win32' ? elevated : isRoot || sudoRequested;

// Non-interactive: no usable TTY (piped stdin, Git Bash/MinTTY, CI) or an explicit
// --yes/--all. The app then drives Detect→Update→Summary without keypresses instead
// of crashing on raw-mode (see useSafeInput + the non-interactive driver).
const nonInteractive =
  !process.stdin.isTTY || args.includes('--yes') || args.includes('-y') || args.includes('--all');

// The graphics query only goes out when the banner could be drawn at all.
const bannerWanted = !nonInteractive && bannerBlocker({
  env: process.env, stdoutTTY: process.stdout.isTTY === true, ascii: ASCII,
  columns: Math.min(process.stdout.columns ?? 0, 100), rows: process.stdout.rows ?? 0,
}) === null;
const probe = await probeTerminal({ interactive: !nonInteractive, images: bannerWanted });
setTerminalTheme(probe.theme);
if (probe.images) {
  const piece = pickPiece(probe.theme, probe.themeKnown);
  const id = pickImageId();
  process.stdout.write(transmitImage(id, piece));
  configureBanner({ id, columns: piece.columns, rows: piece.rows });
  // Every route ends here, Ctrl+C and signals included: free the image so
  // nothing of it stays in the terminal after the app quits.
  process.on('exit', () => { process.stdout.write(deleteImage(id)); });
}

const redirected = !process.stdout.isTTY;
const lineOutput = redirected ? (line: string) => { process.stdout.write(line); } : undefined;
// Ink still supplies the hook lifecycle; only the line writer reaches the pipe.
const sink = redirected ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stdout;
const app = <App sudoMode={sudoMode} nonInteractive={nonInteractive} lineOutput={lineOutput} />;
const { unmount: inkUnmount, rerender } = render(app, { exitOnCtrlC: false, stdout: sink as NodeJS.WriteStream });
// Outside React, a signal can retire the banner and commit the line header synchronously.
const unmount = () => {
  if (retireBanner()) rerender(app);
  inkUnmount();
};

// Which signals exist is the platform's business, so the table is the platform's
// too — SIGBREAK only exists on Windows, and SIGHUP (the window closing) was not
// answered at all until now: the exit route with the least margin and the one
// nobody can retry. The order of what a signal DOES lives in `answerSignal`,
// where a test can reach it.
for (const route of signalRoutes(process.platform)) {
  process.on(route.signal, () =>
    answerSignal(route, {
      settle: (mode, detail) => settleRun(mode, detail),
      cancel: fireProcessCancel,
      unmount,
      exit: exitCode => process.exit(exitCode),
      schedule: (fn, ms) => {
        setTimeout(fn, ms);
      },
    }),
  );
}
