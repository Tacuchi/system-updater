import { describe, it, expect } from 'vitest';
import { parseAptUpgradable } from './apt.js';

describe('parseAptUpgradable', () => {
  it('parses upgradable lines into outdated packages', () => {
    const stdout = [
      'Listing... Done',
      'curl/jammy-updates,jammy-security 7.81.0-1ubuntu1.15 amd64 [upgradable from: 7.81.0-1ubuntu1.14]',
      'vim/jammy-updates 2:8.2.3995-1ubuntu2.16 amd64 [upgradable from: 2:8.2.3995-1ubuntu2.15]',
    ].join('\n');

    expect(parseAptUpgradable(stdout)).toEqual([
      { name: 'curl', currentVersion: '7.81.0-1ubuntu1.14', newVersion: '7.81.0-1ubuntu1.15' },
      { name: 'vim', currentVersion: '2:8.2.3995-1ubuntu2.15', newVersion: '2:8.2.3995-1ubuntu2.16' },
    ]);
  });

  it('strips the architecture suffix from the package name', () => {
    const stdout =
      'libc6:amd64/jammy-updates 2.35-0ubuntu3.8 amd64 [upgradable from: 2.35-0ubuntu3.7]';
    expect(parseAptUpgradable(stdout)).toEqual([
      { name: 'libc6', currentVersion: '2.35-0ubuntu3.7', newVersion: '2.35-0ubuntu3.8' },
    ]);
  });

  it('ignores non-upgradable / header lines', () => {
    const stdout = [
      'Listing... Done',
      'WARNING: apt does not have a stable CLI interface.',
      'someinstalled/jammy,now 1.0.0 amd64 [installed]',
    ].join('\n');
    expect(parseAptUpgradable(stdout)).toEqual([]);
  });

  it('skips malformed upgradable lines that do not match', () => {
    const stdout = 'garbage [upgradable from: x] missing the name slash';
    expect(parseAptUpgradable(stdout)).toEqual([]);
  });

  it('returns [] for empty output', () => {
    expect(parseAptUpgradable('')).toEqual([]);
  });
});
