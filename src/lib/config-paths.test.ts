import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { getConfigDir, getLogDir, getConfigPath } from './config.js';

describe('config/log paths', () => {
  it('config.json lives inside the config dir', () => {
    expect(getConfigPath()).toBe(path.join(getConfigDir(), 'config.json'));
  });

  it('non-Windows keeps the legacy dotdir and a logs subdir (unchanged behavior)', () => {
    if (process.platform === 'win32') return;
    expect(getConfigDir()).toContain('.tacuchi-updater');
    expect(getLogDir()).toBe(path.join(getConfigDir(), 'logs'));
  });
});
