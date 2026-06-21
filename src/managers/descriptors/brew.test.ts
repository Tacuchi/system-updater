import { describe, it, expect } from 'vitest';
import { parseBrewOutdated, brew } from './brew.js';

const ctx = { platform: 'darwin' as NodeJS.Platform, sudoMode: false, meta: {} };

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

describe('brew.percentParser', () => {
  it('reads "==> Upgrading N/M" as a percentage', () => {
    expect(brew.percentParser?.('==> Upgrading 1/1', ctx)).toBe(100);
    expect(brew.percentParser?.('==> Upgrading 3/10 formulae', ctx)).toBe(30);
  });

  it('returns undefined on non-progress lines (spinner carries them)', () => {
    expect(brew.percentParser?.('==> Downloading https://...', ctx)).toBeUndefined();
    expect(brew.percentParser?.('==> Pouring git--2.44.0.bottle.tar.gz', ctx)).toBeUndefined();
  });
});
