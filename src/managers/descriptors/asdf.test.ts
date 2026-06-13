import { describe, it, expect } from 'vitest';
import { parsePlugins, parseInstalledVersions, parseLatest, isOutdated } from './asdf.js';

describe('parsePlugins', () => {
  it('parses one plugin name per line, trimming and dropping blanks', () => {
    const stdout = 'nodejs\n  python \n\nruby\n';
    expect(parsePlugins(stdout)).toEqual(['nodejs', 'python', 'ruby']);
  });

  it('returns [] for empty output', () => {
    expect(parsePlugins('')).toEqual([]);
  });
});

describe('parseInstalledVersions', () => {
  it('parses installed versions, stripping the `*` active marker and indentation', () => {
    const stdout = ['  1.20.4', ' *1.21.0', '  1.19.0'].join('\n');
    expect(parseInstalledVersions(stdout)).toEqual(['1.20.4', '1.21.0', '1.19.0']);
  });

  it('handles `*` with no leading space and surrounding whitespace', () => {
    const stdout = ['*18.17.0', '  20.11.1  '].join('\n');
    expect(parseInstalledVersions(stdout)).toEqual(['18.17.0', '20.11.1']);
  });

  it('drops the "No versions installed" notice and blanks', () => {
    expect(parseInstalledVersions('No versions installed\n')).toEqual([]);
    expect(parseInstalledVersions('   \n\n')).toEqual([]);
  });

  it('returns [] for empty output', () => {
    expect(parseInstalledVersions('')).toEqual([]);
  });
});

describe('parseLatest', () => {
  it('returns the first non-empty version line', () => {
    expect(parseLatest('1.21.0\n')).toBe('1.21.0');
  });

  it('trims surrounding whitespace', () => {
    expect(parseLatest('   20.11.1  \n')).toBe('20.11.1');
  });

  it('returns undefined when the line has no digit (error banner)', () => {
    expect(parseLatest('No compatible versions available\n')).toBeUndefined();
  });

  it('returns undefined for empty output', () => {
    expect(parseLatest('')).toBeUndefined();
  });
});

describe('isOutdated', () => {
  it('is false when installed equals latest', () => {
    expect(isOutdated('1.21.0', '1.21.0')).toBe(false);
  });

  it('is true when latest has a higher major/minor/patch', () => {
    expect(isOutdated('1.20.4', '1.21.0')).toBe(true);
    expect(isOutdated('1.20.4', '2.0.0')).toBe(true);
    expect(isOutdated('1.20.4', '1.20.5')).toBe(true);
  });

  it('is false when installed is newer than latest', () => {
    expect(isOutdated('1.21.0', '1.20.4')).toBe(false);
    expect(isOutdated('2.0.0', '1.99.0')).toBe(false);
  });

  it('compares missing trailing segments as zero', () => {
    expect(isOutdated('1.20', '1.20.0')).toBe(false);
    expect(isOutdated('1.20', '1.20.1')).toBe(true);
  });
});
