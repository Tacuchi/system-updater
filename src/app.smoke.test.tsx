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
          return { success: true, upgraded: 1, failed: 0, errors: [] };
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

    // Shell header renders immediately without crashing (raw-mode OK).
    expect(lastFrame() ?? '').toContain('@tacuchi/updater');

    // Let boot() detect + scan + advance to the select screen.
    await tick(150);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('git'); // the outdated package shows on the Select screen
    expect(frame).toContain('2.44');

    unmount();
  });
});
