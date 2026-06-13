import { describe, it, expect } from 'vitest';
import { parseBrewOutdated } from './brew.js';

describe('parseBrewOutdated', () => {
  it('parses formulae and casks from json v2', () => {
    const json = JSON.stringify({
      formulae: [{ name: 'git', installed_versions: ['2.40.0'], current_version: '2.44.0' }],
      casks: [{ name: 'firefox', installed_versions: ['120.0'], current_version: '125.0' }],
    });
    const out = parseBrewOutdated(json);
    expect(out).toEqual([
      { name: 'git', currentVersion: '2.40.0', newVersion: '2.44.0' },
      { name: 'firefox', currentVersion: '120.0', newVersion: '125.0' },
    ]);
  });

  it('returns [] on empty or invalid json', () => {
    expect(parseBrewOutdated('')).toEqual([]);
    expect(parseBrewOutdated('not json')).toEqual([]);
    expect(parseBrewOutdated(JSON.stringify({}))).toEqual([]);
  });
});
