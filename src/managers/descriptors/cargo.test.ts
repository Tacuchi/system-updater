import { describe, it, expect } from 'vitest';
import { parseCargoInstallUpdateList } from './cargo.js';

describe('parseCargoInstallUpdateList', () => {
  it('parses only rows that need an update, skipping the header and up-to-date rows', () => {
    const stdout = [
      'Package  Installed  Latest   Needs update',
      'racer    2.0.0      2.0.1    Yes',
      'rustfmt  0.9.0      0.9.0    No',
      'ripgrep  13.0.0     14.1.0   Yes',
    ].join('\n');
    expect(parseCargoInstallUpdateList(stdout)).toEqual([
      { name: 'racer', currentVersion: '2.0.0', newVersion: '2.0.1' },
      { name: 'ripgrep', currentVersion: '13.0.0', newVersion: '14.1.0' },
    ]);
  });

  it('is case-insensitive on the "Yes" column', () => {
    const stdout = ['Package  Installed  Latest  Needs update', 'racer    2.0.0      2.0.1   YES'].join('\n');
    expect(parseCargoInstallUpdateList(stdout)).toEqual([
      { name: 'racer', currentVersion: '2.0.0', newVersion: '2.0.1' },
    ]);
  });

  it('strips a leading "v" version prefix when present', () => {
    const stdout = ['Package  Installed  Latest  Needs update', 'racer    v2.0.0     v2.0.1  Yes'].join('\n');
    expect(parseCargoInstallUpdateList(stdout)).toEqual([
      { name: 'racer', currentVersion: '2.0.0', newVersion: '2.0.1' },
    ]);
  });

  it('ignores blank lines, trailing notes and malformed rows', () => {
    const stdout = [
      'Package  Installed  Latest  Needs update',
      '',
      'racer    2.0.0      2.0.1   Yes',
      'garbage',
      '',
      'Note: Use --filter to update only specific packages.',
    ].join('\n');
    expect(parseCargoInstallUpdateList(stdout)).toEqual([
      { name: 'racer', currentVersion: '2.0.0', newVersion: '2.0.1' },
    ]);
  });

  it('returns [] when everything is up to date', () => {
    const stdout = ['Package  Installed  Latest  Needs update', 'rustfmt  0.9.0      0.9.0   No'].join('\n');
    expect(parseCargoInstallUpdateList(stdout)).toEqual([]);
  });

  it('returns [] on empty output', () => {
    expect(parseCargoInstallUpdateList('')).toEqual([]);
  });
});
