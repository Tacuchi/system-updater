import { describe, it, expect } from 'vitest';
import { yarnLineFromVersion, parseYarnGlobalOutdated } from './yarn.js';

describe('yarnLineFromVersion', () => {
  it('classifies 1.x as classic', () => {
    expect(yarnLineFromVersion('1.22.19')).toBe('classic');
    expect(yarnLineFromVersion('1.0.0')).toBe('classic');
  });

  it('classifies >=2 as berry', () => {
    expect(yarnLineFromVersion('2.4.3')).toBe('berry');
    expect(yarnLineFromVersion('3.6.4')).toBe('berry');
    expect(yarnLineFromVersion('4.1.0')).toBe('berry');
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(yarnLineFromVersion('  4.1.0\n')).toBe('berry');
    expect(yarnLineFromVersion(' 1.22.19 ')).toBe('classic');
  });

  it('falls back to classic for undefined / unparseable versions', () => {
    expect(yarnLineFromVersion(undefined)).toBe('classic');
    expect(yarnLineFromVersion('')).toBe('classic');
    expect(yarnLineFromVersion('not-a-version')).toBe('classic');
  });
});

describe('parseYarnGlobalOutdated', () => {
  function tableEvent(head: string[], body: string[][]): string {
    return JSON.stringify({ type: 'table', data: { head, body } });
  }

  it('parses the JSON table event into outdated packages', () => {
    const stdout = [
      JSON.stringify({ type: 'info', data: 'Color legend ...' }),
      tableEvent(
        ['Package', 'Current', 'Wanted', 'Latest', 'Package Type', 'URL'],
        [
          ['typescript', '5.0.0', '5.4.0', '5.4.0', 'dependencies', 'url'],
          ['eslint', '8.0.0', '9.0.0', '9.0.0', 'dependencies', 'url'],
        ],
      ),
    ].join('\n');

    expect(parseYarnGlobalOutdated(stdout)).toEqual([
      { name: 'typescript', currentVersion: '5.0.0', newVersion: '5.4.0' },
      { name: 'eslint', currentVersion: '8.0.0', newVersion: '9.0.0' },
    ]);
  });

  it('maps columns by header position even when reordered', () => {
    const stdout = tableEvent(
      ['Current', 'Latest', 'Package'],
      [['1.0.0', '2.0.0', 'left-pad']],
    );
    expect(parseYarnGlobalOutdated(stdout)).toEqual([
      { name: 'left-pad', currentVersion: '1.0.0', newVersion: '2.0.0' },
    ]);
  });

  it('drops rows whose current already equals latest', () => {
    const stdout = tableEvent(
      ['Package', 'Current', 'Latest'],
      [
        ['up-to-date', '3.0.0', '3.0.0'],
        ['stale', '1.0.0', '1.1.0'],
      ],
    );
    expect(parseYarnGlobalOutdated(stdout)).toEqual([
      { name: 'stale', currentVersion: '1.0.0', newVersion: '1.1.0' },
    ]);
  });

  it('returns [] when required columns are missing', () => {
    const stdout = tableEvent(['Package', 'Current'], [['x', '1.0.0']]);
    expect(parseYarnGlobalOutdated(stdout)).toEqual([]);
  });

  it('ignores non-JSON noise lines and non-table events', () => {
    const stdout = [
      'warning yarn global is deprecated',
      JSON.stringify({ type: 'activityStart', data: {} }),
      tableEvent(['Package', 'Current', 'Latest'], [['eslint', '8.0.0', '9.0.0']]),
    ].join('\n');
    expect(parseYarnGlobalOutdated(stdout)).toEqual([
      { name: 'eslint', currentVersion: '8.0.0', newVersion: '9.0.0' },
    ]);
  });

  it('returns [] for empty output (nothing outdated)', () => {
    expect(parseYarnGlobalOutdated('')).toEqual([]);
    expect(parseYarnGlobalOutdated('\n\n')).toEqual([]);
  });

  it('skips malformed rows missing cells', () => {
    const stdout = tableEvent(
      ['Package', 'Current', 'Latest'],
      [
        ['', '1.0.0', '2.0.0'],
        ['good', '1.0.0', '2.0.0'],
      ],
    );
    expect(parseYarnGlobalOutdated(stdout)).toEqual([
      { name: 'good', currentVersion: '1.0.0', newVersion: '2.0.0' },
    ]);
  });
});
