import { describe, it, expect } from 'vitest';
import { parseMiseOutdated } from './mise.js';

describe('parseMiseOutdated', () => {
  it('parses the Tool/Requested/Current/Latest table, mapping by header', () => {
    const stdout = [
      'Tool    Requested  Current  Latest',
      'node    20         20.11.0  21.6.1',
      'python  latest     3.12.1   3.12.2',
    ].join('\n');

    expect(parseMiseOutdated(stdout)).toEqual([
      { name: 'node', currentVersion: '20.11.0', newVersion: '21.6.1' },
      { name: 'python', currentVersion: '3.12.1', newVersion: '3.12.2' },
    ]);
  });

  it('parses the legacy Tool/Current/Latest table (no Requested column)', () => {
    const stdout = [
      'Tool    Current  Latest',
      'node    20.11.0  21.6.1',
      'go      1.21.0   1.22.3',
    ].join('\n');

    expect(parseMiseOutdated(stdout)).toEqual([
      { name: 'node', currentVersion: '20.11.0', newVersion: '21.6.1' },
      { name: 'go', currentVersion: '1.21.0', newVersion: '1.22.3' },
    ]);
  });

  it('normalizes "-" placeholders for current/latest to "?"', () => {
    const stdout = ['Tool    Requested  Current  Latest', 'ruby    3.3        -        3.3.1'].join('\n');

    expect(parseMiseOutdated(stdout)).toEqual([
      { name: 'ruby', currentVersion: '?', newVersion: '3.3.1' },
    ]);
  });

  it('falls back to positional columns when no header is present', () => {
    const stdout = ['node    20.11.0  21.6.1', 'deno    1.40.0   1.42.0'].join('\n');

    expect(parseMiseOutdated(stdout)).toEqual([
      { name: 'node', currentVersion: '20.11.0', newVersion: '21.6.1' },
      { name: 'deno', currentVersion: '1.40.0', newVersion: '1.42.0' },
    ]);
  });

  it('skips blank lines and single-token rows', () => {
    const stdout = ['Tool    Current  Latest', '', 'node    20.11.0  21.6.1', 'orphan'].join('\n');

    expect(parseMiseOutdated(stdout)).toEqual([
      { name: 'node', currentVersion: '20.11.0', newVersion: '21.6.1' },
    ]);
  });

  it('returns [] for empty output (everything up to date)', () => {
    expect(parseMiseOutdated('')).toEqual([]);
    expect(parseMiseOutdated('\n\n')).toEqual([]);
    // Header only, no rows.
    expect(parseMiseOutdated('Tool    Current  Latest')).toEqual([]);
  });
});
