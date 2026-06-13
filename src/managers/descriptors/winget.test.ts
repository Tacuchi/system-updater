import { describe, it, expect } from 'vitest';
import { parseWingetOutdated } from './winget.js';

describe('parseWingetOutdated', () => {
  it('parses a realistic winget upgrade table keyed by Id', () => {
    const stdout = [
      'Name                 Id                        Version       Available     Source',
      '-------------------------------------------------------------------------------',
      'Git                  Git.Git                   2.40.0        2.44.0        winget',
      'Mozilla Firefox      Mozilla.Firefox           120.0         125.0         winget',
      'PowerToys            Microsoft.PowerToys       0.76.0        0.79.0        winget',
      '',
      '3 upgrades available.',
    ].join('\n');

    expect(parseWingetOutdated(stdout)).toEqual([
      { name: 'Git.Git', currentVersion: '2.40.0', newVersion: '2.44.0' },
      { name: 'Mozilla.Firefox', currentVersion: '120.0', newVersion: '125.0' },
      { name: 'Microsoft.PowerToys', currentVersion: '0.76.0', newVersion: '0.79.0' },
    ]);
  });

  it('ignores everything before the dashed separator (header rows)', () => {
    const stdout = [
      'Some preamble line that should be skipped',
      'Name   Id   Version   Available   Source',
      '----------------------------------------',
      'VLC media player   VideoLAN.VLC   3.0.18   3.0.20   winget',
    ].join('\n');

    expect(parseWingetOutdated(stdout)).toEqual([
      { name: 'VideoLAN.VLC', currentVersion: '3.0.18', newVersion: '3.0.20' },
    ]);
  });

  it('returns [] when there is no table / no upgrades', () => {
    expect(parseWingetOutdated('')).toEqual([]);
    expect(
      parseWingetOutdated('No installed package found matching input criteria.'),
    ).toEqual([]);
  });

  it('skips rows with fewer than 4 columns', () => {
    const stdout = [
      'Name   Id   Version   Available   Source',
      '----------------------------------------',
      'Broken row only two   cols',
      'Good   Good.Pkg   1.0   2.0   winget',
    ].join('\n');

    expect(parseWingetOutdated(stdout)).toEqual([
      { name: 'Good.Pkg', currentVersion: '1.0', newVersion: '2.0' },
    ]);
  });
});
