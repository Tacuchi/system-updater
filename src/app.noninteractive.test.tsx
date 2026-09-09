import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';

// Hermetic: mock detection so NO real package-manager is spawned or upgraded.
// (A real `--yes` run would auto-upgrade the host's packages — never do that in a test.)
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

import App from './app.js';

// Mounting the app boots the real logger. Without this, every `npm test` appended
// a run to the deposit the user actually reads — which is also the deposit the
// retention work has to measure.
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

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

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
});
