import { describe, it, expect } from 'vitest';
import { parseSoftwareUpdateOutdated } from './softwareupdate.js';

describe('parseSoftwareUpdateOutdated', () => {
  it('parses labels with descriptions', () => {
    const out = [
      'Software Update Tool',
      '',
      'Finding available software',
      'Software Update found the following new or updated software:',
      '* Label: macOS Sequoia 15.5-24F74 - macOS Sequoia 15.5',
      '\tTitle: macOS Sequoia 15.5, Version: 15.5, Size: 1234567KiB, Recommended: YES, Action: restart,',
      '* Safari17.6MontereyAuto-17.6 - Safari',
    ].join('\n');
    expect(parseSoftwareUpdateOutdated(out)).toEqual([
      {
        name: 'Label: macOS Sequoia 15.5-24F74',
        currentVersion: 'installed',
        newVersion: 'macOS Sequoia 15.5',
      },
      {
        name: 'Safari17.6MontereyAuto-17.6',
        currentVersion: 'installed',
        newVersion: 'Safari',
      },
    ]);
  });

  it('parses a label with no description', () => {
    const out = '* CommandLineTools';
    expect(parseSoftwareUpdateOutdated(out)).toEqual([
      { name: 'CommandLineTools', currentVersion: 'installed', newVersion: 'available' },
    ]);
  });

  it('returns [] when no new software is available', () => {
    const out = [
      'Software Update Tool',
      '',
      'Finding available software',
      'No new software available.',
    ].join('\n');
    expect(parseSoftwareUpdateOutdated(out)).toEqual([]);
  });

  it('reads from stderr too (softwareupdate writes to both streams)', () => {
    expect(parseSoftwareUpdateOutdated('', '* XProtectPlistConfigData - XProtect')).toEqual([
      { name: 'XProtectPlistConfigData', currentVersion: 'installed', newVersion: 'XProtect' },
    ]);
  });

  it('ignores non-matching lines', () => {
    const out = [
      'Software Update Tool',
      'Finding available software',
      '\tTitle: Some Detail Line',
    ].join('\n');
    expect(parseSoftwareUpdateOutdated(out)).toEqual([]);
  });
});
