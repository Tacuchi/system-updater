import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig, loadConfig, getConfigPath } from './config.js';

describe('normalizeConfig', () => {
  it('fills defaults for an empty config', () => {
    const c = normalizeConfig({});
    expect(c.concurrency).toBe(4);
    expect(c.logTailBytes).toBe(16384);
    expect(c.language).toBe('es');
    expect(c.timeoutsMs).toEqual({});
    expect(c.managers).toEqual({});
    expect(c.logRetentionRuns).toBe(30);
    expect(c.selfCheck).toBe(true);
  });

  it('clamps concurrency into 1..8', () => {
    expect(normalizeConfig({ concurrency: 0 }).concurrency).toBe(1);
    expect(normalizeConfig({ concurrency: 99 }).concurrency).toBe(8);
    expect(normalizeConfig({ concurrency: 3 }).concurrency).toBe(3);
  });

  it('coerces a non-numeric concurrency to the default', () => {
    expect(normalizeConfig({ concurrency: NaN }).concurrency).toBe(4);
  });

  it('preserves per-manager timeouts and toggles', () => {
    const c = normalizeConfig({ timeoutsMs: { brew: 600000 }, managers: { pip: { enabled: false } } });
    expect(c.timeoutsMs['brew']).toBe(600000);
    expect(c.managers['pip']?.enabled).toBe(false);
  });
});

describe('el archivo de preferencias se materializa', () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'updater-cfg-'));
    previous = process.env['TACUCHI_UPDATER_CONFIG_DIR'];
    process.env['TACUCHI_UPDATER_CONFIG_DIR'] = dir;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env['TACUCHI_UPDATER_CONFIG_DIR'];
    else process.env['TACUCHI_UPDATER_CONFIG_DIR'] = previous;
    rmSync(dir, { recursive: true, force: true });
  });

  it('la primera vez que se necesita, existe y trae sus valores por omisión', () => {
    // Nunca existía: saveConfig sólo corría al cambiar un idioma o togglear un
    // gestor, así que quien no tocaba una preferencia no tenía archivo que leer.
    expect(existsSync(getConfigPath())).toBe(false);
    const c = loadConfig();
    expect(existsSync(getConfigPath())).toBe(true);
    const onDisk = JSON.parse(readFileSync(getConfigPath(), 'utf-8')) as Record<string, unknown>;
    expect(onDisk['logRetentionRuns']).toBe(30);
    expect(onDisk['selfCheck']).toBe(true);
    expect(onDisk['concurrency']).toBe(c.concurrency);
  });

  it('respeta lo que el usuario editó y no lo sobreescribe', () => {
    loadConfig();
    const edited = { ...JSON.parse(readFileSync(getConfigPath(), 'utf-8')), logRetentionRuns: 5, selfCheck: false };
    writeFileSync(getConfigPath(), JSON.stringify(edited), 'utf-8');
    const c = loadConfig();
    expect(c.logRetentionRuns).toBe(5);
    expect(c.selfCheck).toBe(false);
  });

  it('una retención inválida cae al valor por omisión, nunca a cero', () => {
    expect(normalizeConfig({ logRetentionRuns: 0 }).logRetentionRuns).toBe(30);
    expect(normalizeConfig({ logRetentionRuns: 7 }).logRetentionRuns).toBe(7);
  });
});
