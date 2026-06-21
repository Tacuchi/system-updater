import { describe, it, expect } from 'vitest';
import { parseChocoOutdated, choco } from './choco.js';

describe('choco descriptor', () => {
  it('whitelists choco reboot / already-(un)installed exit codes as success', () => {
    expect(choco.successExitCodes).toEqual([0, 1605, 1614, 1641, 3010]);
  });
});

describe('parseChocoOutdated', () => {
  it('parses pipe-delimited limit-output lines into outdated packages', () => {
    const stdout = [
      'git|2.40.0|2.43.0|false',
      'nodejs|18.16.0|20.10.0|false',
      'vscode|1.80.0|1.85.0|true',
    ].join('\n');

    expect(parseChocoOutdated(stdout)).toEqual([
      { name: 'git', currentVersion: '2.40.0', newVersion: '2.43.0' },
      { name: 'nodejs', currentVersion: '18.16.0', newVersion: '20.10.0' },
      { name: 'vscode', currentVersion: '1.80.0', newVersion: '1.85.0' },
    ]);
  });

  it('ignores blank lines', () => {
    const stdout = ['', 'git|2.40.0|2.43.0|false', '   ', ''].join('\n');
    expect(parseChocoOutdated(stdout)).toEqual([
      { name: 'git', currentVersion: '2.40.0', newVersion: '2.43.0' },
    ]);
  });

  it('skips lines without the three required pipe fields', () => {
    const stdout = [
      'Chocolatey v2.2.2',
      'git|2.40.0|2.43.0|false',
      'incomplete|2.40.0',
      'Output is package name | current version | available version | pinned?',
    ].join('\n');

    // The header-ish "Output is ..." line happens to contain pipes; verify the
    // parser keeps it only when name/current/latest are all non-empty.
    const result = parseChocoOutdated(stdout);
    expect(result).toContainEqual({
      name: 'git',
      currentVersion: '2.40.0',
      newVersion: '2.43.0',
    });
    // "incomplete|2.40.0" has no third field → dropped.
    expect(result.some(p => p.name === 'incomplete')).toBe(false);
  });

  it('returns [] for empty output', () => {
    expect(parseChocoOutdated('')).toEqual([]);
  });
});
