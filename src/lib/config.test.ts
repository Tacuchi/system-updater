import { describe, it, expect } from 'vitest';
import { normalizeConfig } from './config.js';

describe('normalizeConfig', () => {
  it('fills defaults for an empty config', () => {
    const c = normalizeConfig({});
    expect(c.concurrency).toBe(4);
    expect(c.logTailBytes).toBe(16384);
    expect(c.language).toBe('es');
    expect(c.timeoutsMs).toEqual({});
    expect(c.managers).toEqual({});
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
