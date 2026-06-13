import { describe, it, expect } from 'vitest';
import { parseNpmOutdated } from './npm.js';

describe('parseNpmOutdated', () => {
  it('parses `npm outdated -g --json` keyed-object output', () => {
    const json = JSON.stringify({
      typescript: { current: '5.2.2', wanted: '5.4.5', latest: '5.4.5' },
      eslint: { current: '8.50.0', wanted: '8.57.0', latest: '9.3.0' },
    });
    expect(parseNpmOutdated(json)).toEqual([
      { name: 'typescript', currentVersion: '5.2.2', newVersion: '5.4.5' },
      { name: 'eslint', currentVersion: '8.50.0', newVersion: '9.3.0' },
    ]);
  });

  it('filters out packages already at latest (current === latest)', () => {
    const json = JSON.stringify({
      npm: { current: '10.5.0', wanted: '10.5.0', latest: '10.5.0' },
      vite: { current: '5.0.0', wanted: '5.2.0', latest: '5.2.0' },
    });
    expect(parseNpmOutdated(json)).toEqual([
      { name: 'vite', currentVersion: '5.0.0', newVersion: '5.2.0' },
    ]);
  });

  it('returns [] for empty / whitespace stdout (no globally outdated packages)', () => {
    expect(parseNpmOutdated('')).toEqual([]);
    expect(parseNpmOutdated('   \n ')).toEqual([]);
  });

  it('returns [] for empty json object', () => {
    expect(parseNpmOutdated('{}')).toEqual([]);
  });

  it('returns [] on invalid json', () => {
    expect(parseNpmOutdated('not json')).toEqual([]);
  });
});
