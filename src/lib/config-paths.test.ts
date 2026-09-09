import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { getConfigDir, getLogDir, getConfigPath } from './config.js';

describe('overrides de entorno', () => {
  const keys = ['TACUCHI_UPDATER_CONFIG_DIR', 'TACUCHI_UPDATER_LOG_DIR'] as const;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of keys) saved.set(k, process.env[k]);
  });
  afterEach(() => {
    for (const k of keys) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('el override del directorio de config gana, y el log lo sigue', () => {
    delete process.env['TACUCHI_UPDATER_LOG_DIR'];
    process.env['TACUCHI_UPDATER_CONFIG_DIR'] = path.join('/tmp', 'cfg-override');
    expect(getConfigDir()).toBe(path.join('/tmp', 'cfg-override'));
    expect(getConfigPath()).toBe(path.join('/tmp', 'cfg-override', 'config.json'));
    if (process.platform !== 'win32') {
      expect(getLogDir()).toBe(path.join('/tmp', 'cfg-override', 'logs'));
    }
  });

  it('el override del directorio de logs gana sobre todo lo demás', () => {
    process.env['TACUCHI_UPDATER_CONFIG_DIR'] = path.join('/tmp', 'cfg-override');
    process.env['TACUCHI_UPDATER_LOG_DIR'] = path.join('/tmp', 'log-override');
    expect(getLogDir()).toBe(path.join('/tmp', 'log-override'));
  });
});

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
