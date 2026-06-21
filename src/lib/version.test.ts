import { describe, it, expect } from 'vitest';
import { getVersion } from './version.js';

describe('getVersion', () => {
  it('reads a real semver from package.json (not the stale hardcoded 1.0.0)', () => {
    const v = getVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(v).not.toBe('0.0.0'); // 0.0.0 would mean package.json was not found
  });

  it('is cached (stable across calls)', () => {
    expect(getVersion()).toBe(getVersion());
  });
});
