import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Type-only, so the hoisted vi.mock factory can annotate without importing code.
import type { ManagerDescriptor } from './managers/descriptor.js';
import type { ExecDeps } from './managers/engine.js';

/**
 * Hermetic non-interactive run over a SIMULATED manager.
 *
 * The manager is built by the real `fromDescriptor` with its command execution
 * injected, so the run walks the actual engine — detection, listing, upgrade and
 * verification — without spawning anything. Mocking the registry with a
 * hand-written manager object would skip exactly the code that has to leave a
 * trace, and a `--yes` run against real managers would upgrade the host.
 */
vi.mock('./managers/registry.js', async () => {
  const { fromDescriptor } = await import('./managers/engine.js');
  const { normalizeConfig } = await import('./lib/config.js');
  const descriptor: ManagerDescriptor = {
    id: 'foo',
    group: 'language' as const,
    platforms: ['darwin', 'linux', 'win32'],
    requiresAdmin: false,
    kind: 'direct' as const,
    detectCmd: { cmd: 'foo', args: ['--version'], timeout: 3000 },
    parseVersion: (stdout: string) => stdout.trim(),
    listOutdatedCmd: () => ({ cmd: 'foo', args: ['outdated'] }),
    parseOutdated: (stdout: string) =>
      stdout
        .split('\n')
        .filter(Boolean)
        .map(l => {
          const [name, currentVersion, newVersion] = l.split(/\s+/);
          return { name: name ?? '?', currentVersion, newVersion };
        }),
    upgradeCmd: (pkgs?: string[]) => ({ cmd: 'foo', args: ['upgrade', ...(pkgs ?? [])] }),
  };
  // Listings are consumed in order: boot scan, upgrade's before-snapshot, then
  // the after-snapshot that verification diffs against — empty, so the package
  // really did move.
  const listings = ['left-pad 1.0.0 1.3.0', 'left-pad 1.0.0 1.3.0', ''];
  let listed = 0;
  const deps: ExecDeps = {
    async execCommand(_cmd, args) {
      if (args.includes('--version')) return { stdout: '9.9.9', stderr: '', exitCode: 0 };
      if (args.includes('outdated')) return { stdout: listings[listed++] ?? '', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
    async *runStream(cmd, args) {
      yield { type: 'log' as const, message: 'upgrading left-pad' };
      return {
        cmd: [cmd, ...args].join(' '),
        exitCode: 0,
        durationMs: 5,
        timedOut: false,
        stdoutTail: 'ok',
        stderrTail: '',
      };
    },
  };
  return {
    detectManagers: async () => {
      const manager = fromDescriptor(descriptor, normalizeConfig({}), deps);
      const detection = await manager.detect();
      return detection.available ? [{ manager, detection }] : [];
    },
  };
});

import App from './app.js';

let previousLogDir: string | undefined;
let tmpLogRoot: string;
beforeAll(() => {
  previousLogDir = process.env['TACUCHI_UPDATER_LOG_DIR'];
  tmpLogRoot = mkdtempSync(join(tmpdir(), 'updater-test-logs-'));
  process.env['TACUCHI_UPDATER_LOG_DIR'] = tmpLogRoot;
});
afterAll(() => {
  if (previousLogDir === undefined) delete process.env['TACUCHI_UPDATER_LOG_DIR'];
  else process.env['TACUCHI_UPDATER_LOG_DIR'] = previousLogDir;
  rmSync(tmpLogRoot, { recursive: true, force: true });
});

const tick = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

function logLines(): string[] {
  const file = readdirSync(tmpLogRoot).find(f => f.endsWith('.log'));
  if (!file) return [];
  return readFileSync(join(tmpLogRoot, file), 'utf-8').split('\n').filter(Boolean);
}

describe('App non-interactive flow', () => {
  it('auto-drives detect → select → confirm → update → summary WITHOUT any keypress', async () => {
    // No stdin.write anywhere: the non-interactive driver must advance on its own.
    const { frames, unmount } = render(<App sudoMode={false} nonInteractive />);
    await tick(500);
    const all = frames.join('\n');
    expect(all).toContain('COMPLETADO'); // summary reached
    expect(all).toContain('1'); // 1 upgraded
    unmount();
  });

  it('deja traza del sondeo, del listado y de lo ofrecido frente a lo elegido', () => {
    const lines = logLines();
    expect(lines.length).toBeGreaterThan(0);

    const detects = lines.filter(l => l.includes('foo: detect cmd="foo --version"'));
    expect(detects).toHaveLength(1);
    expect(detects[0]).toContain('timeout=3000ms');
    expect(detects[0]).toContain('exit=0');
    expect(detects[0]).toContain('→ disponible version=9.9.9');

    // One per listing, and the run really does list three times: the boot scan,
    // the upgrade's before-snapshot and the after-snapshot it verifies against.
    const scans = lines.filter(l => l.includes('foo: scan cmd="foo outdated"'));
    expect(scans).toHaveLength(3);
    expect(scans[0]).toContain('→ pendientes=1');
    expect(scans.at(-1)).toContain('→ pendientes=0');

    const selection = lines.filter(l => l.includes('Selección: ofrecidos='));
    expect(selection).toHaveLength(1);
    expect(selection[0]).toContain('ofrecidos=1 elegidos=1');
    expect(lines.some(l => l.includes('  foo: ofrecidos=1 elegidos=1'))).toBe(true);
  });

  it('el estado inicial de esa misma corrida no tiene ninguna de esas líneas', () => {
    const lines = logLines();
    const header = lines.findIndex(l => l.includes('Platform:'));
    const firstTrace = lines.findIndex(
      l => l.includes(': detect cmd=') || l.includes(': scan cmd=') || l.includes('Selección: '),
    );
    expect(header).toBeGreaterThanOrEqual(0);
    expect(firstTrace).toBeGreaterThan(header);
    // The four header lines are the whole initial state: nothing about detection
    // or scanning is claimed before it happened.
    expect(lines.slice(0, header + 1).some(l => l.includes('cmd='))).toBe(false);
  });
});
