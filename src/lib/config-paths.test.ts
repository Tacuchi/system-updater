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

describe('cada rama por sistema, con la plataforma inyectada', () => {
  const keys = ['TACUCHI_UPDATER_CONFIG_DIR', 'TACUCHI_UPDATER_LOG_DIR'] as const;
  const saved = new Map<string, string | undefined>();
  beforeEach(() => {
    for (const k of keys) {
      saved.set(k, process.env[k]);
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // Antes esta prueba hacía `if (process.platform === 'win32') return`, así que
  // una de las dos ramas nunca se corría en ninguna máquina.
  it('unix conserva el dotdir heredado y su subcarpeta de logs', () => {
    for (const platform of ['darwin', 'linux'] as NodeJS.Platform[]) {
      expect(getConfigDir(platform)).toContain('.tacuchi-updater');
      expect(getLogDir(platform)).toBe(path.join(getConfigDir(platform), 'logs'));
    }
  });

  it('Windows usa los directorios del sistema y NO el dotdir', () => {
    const cfg = getConfigDir('win32');
    const logs = getLogDir('win32');
    expect(cfg).not.toContain('.tacuchi-updater');
    // Y los logs no cuelgan del config: van al local, que no se sincroniza.
    expect(logs).not.toBe(path.join(cfg, 'logs'));
    expect(logs.toLowerCase()).toContain('log');
  });
});
