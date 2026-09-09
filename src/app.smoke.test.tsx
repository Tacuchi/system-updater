import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';

// Mock detection so the smoke is hermetic + fast (no real package-manager spawns).
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
          yield { type: 'progress', message: 'downloading', percent: 50 };
          return { success: true, upgraded: 1, failed: 0, errors: [], status: 'success', managerId: 'brew' };
        },
      },
      detection: { available: true, version: '4.0' },
    },
  ],
}));

import App from './app.js';

// Mounting the app boots the real logger. Without this, every `npm test` appended
// a run to the deposit the user actually reads — which is also the deposit the
// retention work has to measure.
let previousLogDir: string | undefined;
let previousConfigDir: string | undefined;
let tmpLogRoot: string;
beforeAll(() => {
  previousLogDir = process.env['TACUCHI_UPDATER_LOG_DIR'];
  previousConfigDir = process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  tmpLogRoot = mkdtempSync(join(tmpdir(), 'updater-test-logs-'));
  process.env['TACUCHI_UPDATER_LOG_DIR'] = tmpLogRoot;
  const cfg = join(tmpLogRoot, 'config');
  process.env['TACUCHI_UPDATER_CONFIG_DIR'] = cfg;
  // Seeded, not defaulted: mounting the app fires the self-version check, and a
  // test must not reach the npm registry.
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, 'config.json'), JSON.stringify({ selfCheck: false }), 'utf-8');

});
afterAll(() => {
  if (previousLogDir === undefined) delete process.env['TACUCHI_UPDATER_LOG_DIR'];
  else process.env['TACUCHI_UPDATER_LOG_DIR'] = previousLogDir;
  if (previousConfigDir === undefined) delete process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  else process.env['TACUCHI_UPDATER_CONFIG_DIR'] = previousConfigDir;
  rmSync(tmpLogRoot, { recursive: true, force: true });
});

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

describe('App (linear flow) smoke', () => {
  it('mounts, renders the shell header, and walks detect → select', async () => {
    const { lastFrame, unmount } = render(<App sudoMode={false} />);
    expect(lastFrame() ?? '').toContain('@tacuchi/updater');
    await tick(150);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('git');
    expect(frame).toContain('2.44');
    unmount();
  });

  it('drives select → confirm → update → summary and reports real success', async () => {
    const { lastFrame, stdin, unmount } = render(<App sudoMode={false} />);
    await tick(180); // detect + scan → select

    stdin.write(' '); // toggle the cursor row (git)
    await tick(30);
    stdin.write('\r'); // enter → confirm
    await tick(40);
    expect(lastFrame() ?? '').toContain('Se ejecutará');

    stdin.write('\r'); // enter → run
    await tick(250); // run completes → RUN_DONE → summary

    const frame = lastFrame() ?? '';
    expect(frame).toContain('COMPLETADO');
    expect(frame).toContain('1'); // 1 upgraded
    unmount();
  });
});
