import React from 'react';
import { describe, it, expect, vi } from 'vitest';
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
