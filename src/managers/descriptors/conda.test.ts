import { describe, it, expect } from 'vitest';
import { parseCondaOutdated } from './conda.js';

describe('parseCondaOutdated', () => {
  it('parses FETCH actions and keeps only entries with old_version', () => {
    const json = JSON.stringify({
      actions: {
        FETCH: [
          { name: 'numpy', version: '1.26.0', old_version: '1.24.0' },
          { name: 'scipy', version: '1.11.0', old_version: '1.10.0' },
          // fresh dependency pulled in, no old_version → not an upgrade
          { name: 'libbrandnew', version: '2.0.0' },
        ],
      },
    });
    expect(parseCondaOutdated(json, '')).toEqual([
      { name: 'numpy', currentVersion: '1.24.0', newVersion: '1.26.0' },
      { name: 'scipy', currentVersion: '1.10.0', newVersion: '1.11.0' },
    ]);
  });

  it('falls back to LINK actions when FETCH is absent', () => {
    const json = JSON.stringify({
      actions: {
        LINK: [{ name: 'pandas', version: '2.2.0', old_version: '2.1.0' }],
      },
    });
    expect(parseCondaOutdated(json, '')).toEqual([
      { name: 'pandas', currentVersion: '2.1.0', newVersion: '2.2.0' },
    ]);
  });

  it('prefers FETCH over LINK when both are present', () => {
    const json = JSON.stringify({
      actions: {
        FETCH: [{ name: 'numpy', version: '1.26.0', old_version: '1.24.0' }],
        LINK: [{ name: 'scipy', version: '1.11.0', old_version: '1.10.0' }],
      },
    });
    expect(parseCondaOutdated(json, '')).toEqual([
      { name: 'numpy', currentVersion: '1.24.0', newVersion: '1.26.0' },
    ]);
  });

  it('reads the JSON from stderr when stdout is empty', () => {
    const json = JSON.stringify({
      actions: { FETCH: [{ name: 'requests', version: '2.31.0', old_version: '2.28.0' }] },
    });
    expect(parseCondaOutdated('', json)).toEqual([
      { name: 'requests', currentVersion: '2.28.0', newVersion: '2.31.0' },
    ]);
  });

  it('returns [] when nothing is outdated (no actions)', () => {
    expect(parseCondaOutdated(JSON.stringify({ message: 'All requested packages already installed.' }), '')).toEqual([]);
    expect(parseCondaOutdated(JSON.stringify({ actions: {} }), '')).toEqual([]);
  });

  it('returns [] on empty or invalid json', () => {
    expect(parseCondaOutdated('', '')).toEqual([]);
    expect(parseCondaOutdated('not json', '')).toEqual([]);
  });
});
