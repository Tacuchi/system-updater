import { describe, it, expect } from 'vitest';
import { parsePacmanOutdated } from './pacman.js';

describe('parsePacmanOutdated', () => {
  it('parses `name old -> new` lines from checkupdates output', () => {
    const stdout = [
      'linux 6.8.1-1 -> 6.8.2-1',
      'pacman 6.0.2-7 -> 6.1.0-1',
      'glibc 2.39-1 -> 2.39-2',
    ].join('\n');
    const out = parsePacmanOutdated(stdout);
    expect(out).toEqual([
      { name: 'linux', currentVersion: '6.8.1-1', newVersion: '6.8.2-1' },
      { name: 'pacman', currentVersion: '6.0.2-7', newVersion: '6.1.0-1' },
      { name: 'glibc', currentVersion: '2.39-1', newVersion: '2.39-2' },
    ]);
  });

  it('ignores blank lines and lines without the `->` arrow', () => {
    const stdout = [
      '',
      ':: Synchronizing package databases...',
      'firefox 124.0-1 -> 125.0-1',
      '   ',
    ].join('\n');
    const out = parsePacmanOutdated(stdout);
    expect(out).toEqual([{ name: 'firefox', currentVersion: '124.0-1', newVersion: '125.0-1' }]);
  });

  it('returns [] for empty output (no updates available)', () => {
    expect(parsePacmanOutdated('')).toEqual([]);
    expect(parsePacmanOutdated('\n\n')).toEqual([]);
  });
});
