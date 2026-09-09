import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { ALL_DESCRIPTORS } from './managers/descriptors/index.js';

/**
 * Exit-route harness — the level the defect actually lived at.
 *
 * Nine real runs of the published version showed three that finished their whole
 * job and whose log never said so: the closing block hung off a React effect, and
 * no exit path drained the log sink. Neither fact is observable from a unit test
 * of any single module, so this file launches the COMPILED binary and reads the
 * file it left behind.
 *
 * Every child gets its own log and config directories — never the user's — and a
 * config with every manager disabled, so a `--yes` run against the real machine
 * probes but never scans and never upgrades anything real.
 */

const DIST = path.resolve('dist/cli.js');
const unix = process.platform !== 'win32';
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

let tmpRoot: string;
let previousLogDir: string | undefined;
let previousConfigDir: string | undefined;

beforeAll(() => {
  // Build unconditionally: a harness that would happily pass against a stale
  // dist/ is not evidence about the source anybody just changed.
  execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
  expect(fs.existsSync(DIST)).toBe(true);
}, 180_000);

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-exits-'));
  // Also for the in-process case: the quit-key route mounts the app for real, and
  // a test has no business appending to the deposit the user actually reads.
  previousLogDir = process.env['TACUCHI_UPDATER_LOG_DIR'];
  previousConfigDir = process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  process.env['TACUCHI_UPDATER_LOG_DIR'] = path.join(tmpRoot, 'inproc');
  const inprocConfig = path.join(tmpRoot, 'inproc-config');
  process.env['TACUCHI_UPDATER_CONFIG_DIR'] = inprocConfig;
  fs.mkdirSync(inprocConfig, { recursive: true });
  fs.writeFileSync(path.join(inprocConfig, 'config.json'), JSON.stringify({ selfCheck: false }), 'utf-8');
});

afterEach(() => {
  if (previousLogDir === undefined) delete process.env['TACUCHI_UPDATER_LOG_DIR'];
  else process.env['TACUCHI_UPDATER_LOG_DIR'] = previousLogDir;
  if (previousConfigDir === undefined) delete process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  else process.env['TACUCHI_UPDATER_CONFIG_DIR'] = previousConfigDir;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

interface Launch {
  child: ChildProcess;
  logDir: string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/**
 * A config dir of our own, with every manager disabled except the ones named.
 * A disabled manager is still probed (a read-only `--version`) but never scanned
 * and never upgraded — which is what makes launching the real binary safe.
 */
function configDirWithOnly(enabled: string[]): string {
  const dir = path.join(tmpRoot, 'config');
  fs.mkdirSync(dir, { recursive: true });
  const enabledManagers = Object.fromEntries(ALL_DESCRIPTORS.map(d => [d.id, enabled.includes(d.id)]));
  // `selfCheck: false` because a test has no business querying the npm registry:
  // it would make the suite depend on the network and ping a public service on
  // every run.
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ enabledManagers, selfCheck: false }, null, 2),
    'utf-8',
  );
  return dir;
}

function launch(args: string[], pathDir?: string, enabled: string[] = []): Launch {
  const logDir = path.join(tmpRoot, 'logs');
  const searchPath = pathDir ?? path.join(tmpRoot, 'nopath');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(searchPath, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TACUCHI_UPDATER_LOG_DIR: logDir,
    TACUCHI_UPDATER_CONFIG_DIR: configDirWithOnly(enabled),
    PATH: searchPath,
    Path: searchPath,
  };
  delete env['VITEST'];
  const child = spawn(process.execPath, [DIST, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  // Drain both pipes: a full stdout buffer would block the child mid-run, and
  // Ink writes a frame per redraw.
  child.stdout?.resume();
  child.stderr?.resume();
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, logDir, exited };
}

/** The log the child wrote, or null while it has not created one yet. */
function readLog(logDir: string): string | null {
  if (!fs.existsSync(logDir)) return null;
  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
  if (files.length !== 1) return null;
  return fs.readFileSync(path.join(logDir, files[0] as string), 'utf-8');
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`timeout esperando ${what}`);
}

/**
 * A fake `npm` whose LISTING hangs, so the child is demonstrably still working
 * when a signal arrives.
 *
 * Waiting for the log header was not enough: with nothing on PATH the whole run
 * finished in a few hundred milliseconds, so the process could be gone before
 * the signal landed and the closure honestly said `completa`. A test whose
 * outcome depends on who wins that race proves nothing about either mode.
 */
function fakeSlowScanDir(pidFile: string): string {
  const dir = path.join(tmpRoot, 'slowbin');
  const systemPath = process.platform === 'darwin' ? '/usr/bin:/bin:/usr/sbin:/sbin' : '/usr/bin:/bin';
  fs.mkdirSync(dir, { recursive: true });
  const script = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "10.0.0"; exit 0; fi',
    'if [ "$1" = "outdated" ]; then',
    '  /bin/sleep 987 &',
    `  echo "$$ $!" > "${pidFile}"`,
    '  wait',
    '  exit 0',
    'fi',
    'exit 0',
    '',
  ].join('\n');
  const file = path.join(dir, 'npm');
  fs.writeFileSync(file, script, 'utf-8');
  fs.chmodSync(file, 0o755);
  return `${dir}:${systemPath}`;
}

/**
 * The two invariants of every exit route, asserted together on purpose: a log
 * that ends with its closure but lost its header proves nothing, and neither does
 * one that kept every line and never said how the run ended.
 */
function expectClosedLog(raw: string | null, mode: string): void {
  expect(raw).not.toBeNull();
  const text = raw as string;
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  // Nothing already emitted was lost: the four header lines are still there.
  expect(text).toContain('Logger iniciado — @tacuchi/updater');
  expect(text).toContain('Log: ');
  expect(text).toContain('PID: ');
  expect(text).toContain('Platform: ');

  // The run declared how it ended, exactly once, on the LAST line of the file.
  const closures = lines.filter(l => l.includes('Cierre del run:'));
  expect(closures).toHaveLength(1);
  expect(lines.at(-1)).toContain(`Cierre del run: modo=${mode}`);
}

describe('ruta de salida: modo no interactivo', () => {
  it('cierra el registro declarando que la corrida se completó', async () => {
    const { logDir, exited } = launch(['--yes']);
    const { code } = await exited;
    expect(code).toBe(0);
    expectClosedLog(readLog(logDir), 'completa');
  }, 60_000);
});

describe.skipIf(!unix)('ruta de salida: señales', () => {
  /** Launch, wait until the child is provably mid-scan, then signal it. */
  async function signalMidRun(signal: NodeJS.Signals): Promise<string | null> {
    const pidFile = path.join(tmpRoot, `${signal}.pids`);
    const { child, logDir, exited } = launch(['--yes'], fakeSlowScanDir(pidFile), ['npm']);
    await waitUntil(() => recordedPids(pidFile).length === 2, 40_000, 'que el escaneo esté en vuelo');
    child.kill(signal);
    await exited;
    return readLog(logDir);
  }

  it('Ctrl+C (SIGINT) cierra el registro como cancelación del usuario', async () => {
    expectClosedLog(await signalMidRun('SIGINT'), 'cancelada');
  }, 90_000);

  it('SIGTERM cierra el registro como interrupción del entorno', async () => {
    expectClosedLog(await signalMidRun('SIGTERM'), 'interrumpida');
  }, 90_000);

  it('cerrar la terminal (SIGHUP) deja cierre en vez de un registro trunco', async () => {
    expectClosedLog(await signalMidRun('SIGHUP'), 'interrumpida');
  }, 90_000);
});

/**
 * A fake `npm` on the PATH: it reports a version, lists one outdated package, and
 * then hangs on the upgrade with a REAL grandchild under it — the shape that
 * orphans a `brew`/`winget` install when only the direct child is signalled.
 *
 * It records both pids so the test can ask the OS about them directly. Grepping
 * `ps` for the sleep's command line looked simpler and was wrong twice over: an
 * orphan is reparented to pid 1, and the string also matches the shell that
 * launched the suite — a check that reported "alive" no matter what happened.
 */
function fakeNpmDir(pidFile: string): string {
  const dir = path.join(tmpRoot, 'fakebin');
  const systemPath = process.platform === 'darwin' ? '/usr/bin:/bin:/usr/sbin:/sbin' : '/usr/bin:/bin';
  fs.mkdirSync(dir, { recursive: true });
  const script = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "10.0.0"; exit 0; fi',
    `if [ "$1" = "outdated" ]; then echo '{"left-pad":{"current":"1.0.0","wanted":"1.3.0","latest":"1.3.0"}}'; exit 0; fi`,
    'if [ "$1" = "update" ]; then',
    '  /bin/sleep 987 &',
    `  echo "$$ $!" > "${pidFile}"`,
    '  wait',
    '  exit 0',
    'fi',
    'exit 0',
    '',
  ].join('\n');
  const file = path.join(dir, 'npm');
  fs.writeFileSync(file, script, 'utf-8');
  fs.chmodSync(file, 0o755);
  // The fake comes FIRST so it shadows the real npm; the system directories stay
  // on the path because killing a process tree on unix shells out to `ps`.
  return `${dir}:${systemPath}`;
}

function recordedPids(pidFile: string): number[] {
  if (!fs.existsSync(pidFile)) return [];
  return fs
    .readFileSync(pidFile, 'utf-8')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0);
}

function stillAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!unix)('ruta de salida con una actualización en vuelo', () => {
  it('no deja ningún proceso hijo vivo y declara la cancelación', async () => {
    const pidFile = path.join(tmpRoot, 'upgrade.pids');
    const { child, logDir, exited } = launch(['--yes'], fakeNpmDir(pidFile), ['npm']);
    await waitUntil(() => recordedPids(pidFile).length === 2, 40_000, 'que la actualización esté en vuelo');
    const pids = recordedPids(pidFile);
    expect(pids.map(stillAlive)).toEqual([true, true]);

    child.kill('SIGINT');
    await exited;
    await waitUntil(() => pids.every(p => !stillAlive(p)), 10_000, 'que el árbol de procesos muera');

    // The grandchild too, not just the process execa was holding.
    expect(pids.map(stillAlive)).toEqual([false, false]);
    expectClosedLog(readLog(logDir), 'cancelada');
  }, 90_000);
});

/**
 * The quit key is the one route a spawned process cannot receive: without a TTY
 * Ink's raw mode is unsupported and `useSafeInput` is inert by design. So it is
 * exercised at the level it exists at — a keypress into the mounted app — while
 * the behaviour asserted is the same one the other routes assert.
 */
vi.mock('./managers/registry.js', () => ({
  detectManagers: async () => [
    {
      manager: {
        id: 'brew',
        platforms: ['darwin', 'linux', 'win32'],
        requiresAdmin: false,
        group: 'system',
        detect: async () => ({ available: true, version: '4.0' }),
        listOutdated: async () => [{ name: 'git', currentVersion: '2.40', newVersion: '2.44' }],
        async *upgrade() {
          yield { type: 'log', message: 'brew upgrade git' };
          return { success: true, upgraded: 1, failed: 0, errors: [], status: 'success', managerId: 'brew' };
        },
      },
      detection: { available: true, version: '4.0' },
    },
  ],
}));

describe('ruta de salida: tecla de salida', () => {
  it('asienta la corrida como cancelación del usuario', async () => {
    const { resetRunSettlement, isRunSettled } = await import('./lib/run-closure.js');
    const App = (await import('./app.js')).default;
    resetRunSettlement();
    const previousExitCode = process.exitCode;

    const { stdin, unmount } = render(React.createElement(App, { sudoMode: false }));
    await sleep(300);
    expect(isRunSettled()).toBe(false);
    stdin.write('q');
    await sleep(100);

    expect(isRunSettled()).toBe(true);
    unmount();
    process.exitCode = previousExitCode;
  }, 30_000);
});
