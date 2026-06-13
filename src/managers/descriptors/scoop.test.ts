import { describe, it, expect } from 'vitest';
import { parseScoopOutdated } from './scoop.js';

describe('parseScoopOutdated', () => {
  it('parses a realistic `scoop status` table', () => {
    const stdout = [
      'Scoop is up to date.',
      '',
      'Name    Installed Version  Latest Version  Missing Dependencies  Info',
      '----    -----------------  --------------  --------------------  ----',
      '7zip    21.07              22.01',
      'git     2.39.0             2.40.0',
      'nodejs  18.12.0            20.10.0',
      '',
    ].join('\n');

    expect(parseScoopOutdated(stdout)).toEqual([
      { name: '7zip', currentVersion: '21.07', newVersion: '22.01' },
      { name: 'git', currentVersion: '2.39.0', newVersion: '2.40.0' },
      { name: 'nodejs', currentVersion: '18.12.0', newVersion: '20.10.0' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const stdout =
      'Name  Installed Version  Latest Version\r\n' +
      '----  -----------------  --------------\r\n' +
      'curl  8.4.0              8.5.0\r\n';

    expect(parseScoopOutdated(stdout)).toEqual([
      { name: 'curl', currentVersion: '8.4.0', newVersion: '8.5.0' },
    ]);
  });

  it('ignores everything before the dashed separator (preamble + header)', () => {
    const stdout = [
      'Updating Scoop...',
      'Scoop was updated successfully!',
      'Name  Installed Version  Latest Version',
      '----  -----------------  --------------',
      'vim   9.0               9.1',
    ].join('\n');

    expect(parseScoopOutdated(stdout)).toEqual([
      { name: 'vim', currentVersion: '9.0', newVersion: '9.1' },
    ]);
  });

  it('skips rows missing the latest-version cell (e.g. only missing deps/info)', () => {
    const stdout = [
      'Name      Installed Version  Latest Version  Missing Dependencies  Info',
      '----      -----------------  --------------  --------------------  ----',
      'g0        1.0',
      'gitstuff  2.39.0             2.40.0',
    ].join('\n');

    expect(parseScoopOutdated(stdout)).toEqual([
      { name: 'gitstuff', currentVersion: '2.39.0', newVersion: '2.40.0' },
    ]);
  });

  it('returns [] when there is no table / everything is up to date', () => {
    expect(parseScoopOutdated('')).toEqual([]);
    expect(parseScoopOutdated('Everything is up to date!')).toEqual([]);
  });
});
