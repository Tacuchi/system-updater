import { describe, it, expect } from 'vitest';
import { parseGemOutdated, parseUserGems } from './gem.js';

describe('parseUserGems', () => {
  it('parses newline-separated gem names, trimming and dropping blanks', () => {
    const stdout = 'rails\n  rake \n\nbundler\n';
    expect(parseUserGems(stdout)).toEqual(new Set(['rails', 'rake', 'bundler']));
  });

  it('returns an empty set for empty output', () => {
    expect(parseUserGems('')).toEqual(new Set());
  });
});

describe('parseGemOutdated', () => {
  const userGems = new Set(['rails', 'rake', 'nokogiri']);

  it('parses `gem outdated` lines for user gems in the active GEM_HOME', () => {
    const stdout = ['rails (7.0.0 < 7.1.0)', 'rake (13.0.1 < 13.1.0)', 'nokogiri (1.15.0 < 1.16.2)'].join('\n');
    expect(parseGemOutdated(stdout, userGems)).toEqual([
      { name: 'rails', currentVersion: '7.0.0', newVersion: '7.1.0' },
      { name: 'rake', currentVersion: '13.0.1', newVersion: '13.1.0' },
      { name: 'nokogiri', currentVersion: '1.15.0', newVersion: '1.16.2' },
    ]);
  });

  it('filters out gems not installed by the user in the active GEM_HOME', () => {
    // `psych` and `json` are default/bundled gems → not in the user-gems set.
    const stdout = ['rails (7.0.0 < 7.1.0)', 'psych (4.0.0 < 5.1.0)', 'json (2.6.1 < 2.7.1)'].join('\n');
    expect(parseGemOutdated(stdout, userGems)).toEqual([
      { name: 'rails', currentVersion: '7.0.0', newVersion: '7.1.0' },
    ]);
  });

  it('skips lines that do not match the outdated format and ignores blanks', () => {
    const stdout = ['', 'Updating installed gems', 'rails (7.0.0 < 7.1.0)', 'garbage line'].join('\n');
    expect(parseGemOutdated(stdout, userGems)).toEqual([
      { name: 'rails', currentVersion: '7.0.0', newVersion: '7.1.0' },
    ]);
  });

  it('returns [] when nothing matches', () => {
    expect(parseGemOutdated('', userGems)).toEqual([]);
  });
});
