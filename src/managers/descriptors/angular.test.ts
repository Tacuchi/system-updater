import { describe, it, expect } from 'vitest';
import { parseNgVersion, parseLatestVersion } from './angular.js';

describe('parseNgVersion', () => {
  it('extracts the CLI version from the multi-line `ng version` banner', () => {
    const stdout = [
      '',
      '     _                      _                 ____ _     ___',
      "    / \\   _ __   __ _ _   _| | __ _ _ __    / ___| |   |_ _|",
      "   / △ \\ | '_ \\ / _` | | | | |/ _` | '__|  | |   | |    | |",
      '  / ___ \\| | | | (_| | |_| | | (_| | |     | |___| |___ | |',
      " /_/   \\_\\_| |_|\\__, |\\__,_|_|\\__,_|_|      \\____|_____|___|",
      '                |___/',
      '',
      '',
      'Angular CLI: 17.0.0',
      'Node: 20.9.0',
      'Package Manager: npm 10.1.0',
      'OS: darwin arm64',
    ].join('\n');
    expect(parseNgVersion(stdout)).toBe('17.0.0');
  });

  it('handles extra whitespace after the label', () => {
    expect(parseNgVersion('Angular CLI:   16.2.10\nNode: 18.0.0')).toBe('16.2.10');
  });

  it('returns undefined when the banner has no CLI version line', () => {
    expect(parseNgVersion('Node: 20.9.0\nOS: darwin arm64')).toBeUndefined();
    expect(parseNgVersion('')).toBeUndefined();
  });
});

describe('parseLatestVersion', () => {
  it('trims the bare version printed by `npm view`', () => {
    expect(parseLatestVersion('17.3.1\n')).toBe('17.3.1');
    expect(parseLatestVersion('  18.0.0  ')).toBe('18.0.0');
  });

  it('returns undefined on empty output', () => {
    expect(parseLatestVersion('')).toBeUndefined();
    expect(parseLatestVersion('   \n')).toBeUndefined();
  });
});
