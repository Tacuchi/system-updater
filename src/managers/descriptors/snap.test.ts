import { describe, it, expect } from 'vitest';
import { parseSnapOutdated } from './snap.js';

describe('parseSnapOutdated', () => {
  it('parses a normal refresh --list listing (skips header, maps columns)', () => {
    const stdout = [
      'Name        Version    Rev   Publisher   Notes',
      'core20      20240227   2264  canonical*  base',
      'firefox     123.0-2    3779  mozilla**   -',
    ].join('\n');

    expect(parseSnapOutdated(stdout)).toEqual([
      { name: 'core20', currentVersion: '2264', newVersion: '20240227' },
      { name: 'firefox', currentVersion: '3779', newVersion: '123.0-2' },
    ]);
  });

  it('returns empty when everything is up to date', () => {
    expect(parseSnapOutdated('All snaps up to date.')).toEqual([]);
  });

  it('returns empty for header-only output (no refreshable snaps)', () => {
    expect(parseSnapOutdated('Name  Version  Rev  Publisher  Notes')).toEqual([]);
  });

  it('returns empty for empty stdout', () => {
    expect(parseSnapOutdated('')).toEqual([]);
  });

  it('tolerates blank lines and trailing whitespace', () => {
    const stdout = ['Name     Version  Rev   Publisher  Notes', '', '  hello-world  6.4  29   canonical*  -  ', ''].join(
      '\n',
    );

    expect(parseSnapOutdated(stdout)).toEqual([
      { name: 'hello-world', currentVersion: '29', newVersion: '6.4' },
    ]);
  });

  it('falls back to placeholders when columns are missing', () => {
    const stdout = ['Name  Version  Rev  Publisher  Notes', 'lonelysnap'].join('\n');

    expect(parseSnapOutdated(stdout)).toEqual([
      { name: 'lonelysnap', currentVersion: '?', newVersion: 'available' },
    ]);
  });
});
