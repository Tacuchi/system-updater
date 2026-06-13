import { describe, it, expect } from 'vitest';
import { parsePnpmOutdated } from './pnpm.js';

describe('parsePnpmOutdated', () => {
  it('parses the box-drawing table from `pnpm outdated --global`', () => {
    const stdout = [
      '┌────────────┬─────────┬────────┐',
      '│ Package    │ Current │ Latest │',
      '├────────────┼─────────┼────────┤',
      '│ typescript │ 5.2.2   │ 5.4.5  │',
      '├────────────┼─────────┼────────┤',
      '│ eslint     │ 8.50.0  │ 9.3.0  │',
      '└────────────┴─────────┴────────┘',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'typescript', currentVersion: '5.2.2', newVersion: '5.4.5' },
      { name: 'eslint', currentVersion: '8.50.0', newVersion: '9.3.0' },
    ]);
  });

  it('skips the header row and all border rows', () => {
    const stdout = [
      '┌────────────┬─────────┬────────┐',
      '│ Package    │ Current │ Latest │',
      '├────────────┼─────────┼────────┤',
      '│ vite       │ 5.0.0   │ 5.2.0  │',
      '└────────────┴─────────┴────────┘',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'vite', currentVersion: '5.0.0', newVersion: '5.2.0' },
    ]);
  });

  it('drops rows where current === latest (nothing to update)', () => {
    const stdout = [
      '│ Package │ Current │ Latest │',
      '│ pnpm    │ 9.1.0   │ 9.1.0  │',
      '│ vite    │ 5.0.0   │ 5.2.0  │',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'vite', currentVersion: '5.0.0', newVersion: '5.2.0' },
    ]);
  });

  it('keeps only the package name token when the cell carries annotations', () => {
    const stdout = [
      '│ Package                 │ Current │ Latest │',
      '│ typescript (deprecated) │ 5.2.2   │ 5.4.5  │',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'typescript', currentVersion: '5.2.2', newVersion: '5.4.5' },
    ]);
  });

  it('keeps only the leading version token when a version cell is annotated', () => {
    const stdout = [
      '│ Package │ Current │ Latest    │',
      '│ esbuild │ 0.19.0  │ 0.21.0  * │',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'esbuild', currentVersion: '0.19.0', newVersion: '0.21.0' },
    ]);
  });

  it('parses an ASCII-bordered fallback table (+---+ / | cells)', () => {
    const stdout = [
      '+------------+---------+--------+',
      '| Package    | Current | Latest |',
      '+------------+---------+--------+',
      '| prettier   | 3.0.0   | 3.2.5  |',
      '+------------+---------+--------+',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'prettier', currentVersion: '3.0.0', newVersion: '3.2.5' },
    ]);
  });

  it('returns [] when nothing is outdated (empty / whitespace stdout)', () => {
    expect(parsePnpmOutdated('')).toEqual([]);
    expect(parsePnpmOutdated('   \n\t ')).toEqual([]);
  });

  it('returns [] for a header-only table with no data rows', () => {
    const stdout = [
      '┌────────────┬─────────┬────────┐',
      '│ Package    │ Current │ Latest │',
      '└────────────┴─────────┴────────┘',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([]);
  });

  it('ignores non-table noise lines without vertical bars', () => {
    const stdout = [
      'Progress: resolved 5, reused 5',
      '│ Package │ Current │ Latest │',
      '│ rimraf  │ 5.0.0   │ 5.0.5  │',
      'Done in 1.2s',
    ].join('\n');
    expect(parsePnpmOutdated(stdout)).toEqual([
      { name: 'rimraf', currentVersion: '5.0.0', newVersion: '5.0.5' },
    ]);
  });
});
