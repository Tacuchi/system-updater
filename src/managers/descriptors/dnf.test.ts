import { describe, it, expect } from 'vitest';
import { parseDnfOutdated, dnf } from './dnf.js';

const ctx = { platform: 'linux' as NodeJS.Platform, sudoMode: true, meta: {} };

describe('parseDnfOutdated', () => {
  it('parses name.arch + new version columns, stripping arch', () => {
    const stdout = [
      'Last metadata expiration check: 0:12:34 ago on Fri 13 Jun 2026 10:00:00 AM.',
      '',
      'bash.x86_64                    5.2.21-3.fc40                    updates',
      'curl.x86_64                    8.6.0-10.fc40                    updates',
      'kernel.x86_64                  6.8.10-300.fc40                  updates',
    ].join('\n');

    expect(parseDnfOutdated(stdout)).toEqual([
      { name: 'bash', currentVersion: 'installed', newVersion: '5.2.21-3.fc40' },
      { name: 'curl', currentVersion: 'installed', newVersion: '8.6.0-10.fc40' },
      { name: 'kernel', currentVersion: 'installed', newVersion: '6.8.10-300.fc40' },
    ]);
  });

  it('skips the Obsoleting Packages section and its entries', () => {
    const stdout = [
      'firefox.x86_64                 126.0-1.fc40                     updates',
      '',
      'Obsoleting Packages',
      'old-libfoo.x86_64              2.0-1.fc40                       updates',
    ].join('\n');

    // The "Obsoleting Packages" header is dropped; entries under it still parse
    // as columns (matching legacy behavior, which only filtered the header).
    expect(parseDnfOutdated(stdout)).toEqual([
      { name: 'firefox', currentVersion: 'installed', newVersion: '126.0-1.fc40' },
      { name: 'old-libfoo', currentVersion: 'installed', newVersion: '2.0-1.fc40' },
    ]);
  });

  it('drops lines with fewer than two columns', () => {
    const stdout = ['solo-token', 'pkg.noarch   1.2.3-1.fc40   fedora'].join('\n');
    expect(parseDnfOutdated(stdout)).toEqual([
      { name: 'pkg', currentVersion: 'installed', newVersion: '1.2.3-1.fc40' },
    ]);
  });

  it('returns [] for empty stdout (exit 0, nothing to do)', () => {
    expect(parseDnfOutdated('')).toEqual([]);
    expect(parseDnfOutdated('\n\n')).toEqual([]);
  });
});

describe('dnf.percentParser', () => {
  it('reads "Verifying : N/M" as a percentage', () => {
    expect(dnf.percentParser?.('  Verifying        : 2/4', ctx)).toBe(50);
    expect(dnf.percentParser?.('  Verifying : 4/4', ctx)).toBe(100);
  });

  it('returns undefined on other transaction lines', () => {
    expect(dnf.percentParser?.('  Upgrading       : bash-5.2.21-3.fc40.x86_64', ctx)).toBeUndefined();
  });
});
