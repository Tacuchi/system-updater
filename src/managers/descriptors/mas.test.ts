import { describe, it, expect } from 'vitest';
import { parseMasOutdated } from './mas.js';

describe('parseMasOutdated', () => {
  it('parses id (as name), current and new versions from each line', () => {
    const stdout = [
      '497799835 Xcode (14.0 -> 14.1)',
      '1295203466 Microsoft Remote Desktop (10.7.6 -> 10.8.0)',
    ].join('\n');
    expect(parseMasOutdated(stdout)).toEqual([
      { name: '497799835', currentVersion: '14.0', newVersion: '14.1' },
      { name: '1295203466', currentVersion: '10.7.6', newVersion: '10.8.0' },
    ]);
  });

  it('handles app names containing spaces and tolerates surrounding whitespace', () => {
    const stdout = '   408981434 iMovie (10.3.5 -> 10.4)   ';
    expect(parseMasOutdated(stdout)).toEqual([
      { name: '408981434', currentVersion: '10.3.5', newVersion: '10.4' },
    ]);
  });

  it('drops blank and non-matching lines', () => {
    const stdout = [
      '',
      'Warning: something happened',
      '497799835 Xcode (14.0 -> 14.1)',
      '   ',
      'No updates available',
    ].join('\n');
    expect(parseMasOutdated(stdout)).toEqual([
      { name: '497799835', currentVersion: '14.0', newVersion: '14.1' },
    ]);
  });

  it('returns [] for empty output (no outdated apps)', () => {
    expect(parseMasOutdated('')).toEqual([]);
    expect(parseMasOutdated('\n\n')).toEqual([]);
  });

  it('falls back to ? when a version side is empty', () => {
    const stdout = '12345 SomeApp ( -> 2.0)';
    expect(parseMasOutdated(stdout)).toEqual([
      { name: '12345', currentVersion: '?', newVersion: '2.0' },
    ]);
  });
});
