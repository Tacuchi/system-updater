import { describe, it, expect } from 'vitest';
import { parseFlatpakOutdated } from './flatpak.js';

describe('parseFlatpakOutdated', () => {
  it('parses tab-separated application/version rows', () => {
    const stdout = [
      'org.mozilla.firefox\t125.0.1',
      'org.gimp.GIMP\t2.10.36',
      'com.spotify.Client\t1.2.31.1205',
    ].join('\n');

    expect(parseFlatpakOutdated(stdout)).toEqual([
      { name: 'org.mozilla.firefox', currentVersion: 'installed', newVersion: '125.0.1' },
      { name: 'org.gimp.GIMP', currentVersion: 'installed', newVersion: '2.10.36' },
      { name: 'com.spotify.Client', currentVersion: 'installed', newVersion: '1.2.31.1205' },
    ]);
  });

  it('falls back to "available" when version column is missing or empty', () => {
    const stdout = ['org.example.NoVersion\t', 'org.example.OnlyId'].join('\n');

    expect(parseFlatpakOutdated(stdout)).toEqual([
      { name: 'org.example.NoVersion', currentVersion: 'installed', newVersion: 'available' },
      { name: 'org.example.OnlyId', currentVersion: 'installed', newVersion: 'available' },
    ]);
  });

  it('ignores blank lines and trailing whitespace', () => {
    const stdout = ['', 'org.kde.kate\t24.02.0  ', '   ', ''].join('\n');

    expect(parseFlatpakOutdated(stdout)).toEqual([
      { name: 'org.kde.kate', currentVersion: 'installed', newVersion: '24.02.0' },
    ]);
  });

  it('returns [] when there are no updates', () => {
    expect(parseFlatpakOutdated('')).toEqual([]);
    expect(parseFlatpakOutdated('\n\n')).toEqual([]);
  });
});
