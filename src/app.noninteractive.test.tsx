import React from 'react';
import { describe, it, expect, vi } from 'vitest';
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
