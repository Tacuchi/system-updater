import { describe, it, expect } from 'vitest';
import { parsePipxList } from './pipx.js';

describe('parsePipxList', () => {
  it('parses main packages across venvs into a flat name→version map', () => {
    const json = JSON.stringify({
      pipx_spec_version: '0.1',
      venvs: {
        black: {
          metadata: {
            main_package: { package: 'black', package_version: '23.9.1' },
            injected_packages: {},
          },
        },
        poetry: {
          metadata: {
            main_package: { package: 'poetry', package_version: '1.6.1' },
          },
        },
      },
    });
    expect(parsePipxList(json)).toEqual({ black: '23.9.1', poetry: '1.6.1' });
  });

  it('includes injected packages alongside the main package', () => {
    const json = JSON.stringify({
      venvs: {
        flake8: {
          metadata: {
            main_package: { package: 'flake8', package_version: '6.1.0' },
            injected_packages: {
              'flake8-bugbear': { package: 'flake8-bugbear', package_version: '23.9.16' },
            },
          },
        },
      },
    });
    expect(parsePipxList(json)).toEqual({
      flake8: '6.1.0',
      'flake8-bugbear': '23.9.16',
    });
  });

  it('skips entries missing a package name or version', () => {
    const json = JSON.stringify({
      venvs: {
        good: { metadata: { main_package: { package: 'good', package_version: '1.0.0' } } },
        noVersion: { metadata: { main_package: { package: 'noVersion' } } },
        noName: { metadata: { main_package: { package_version: '2.0.0' } } },
        noMeta: {},
      },
    });
    expect(parsePipxList(json)).toEqual({ good: '1.0.0' });
  });

  it('returns {} when there are no venvs', () => {
    expect(parsePipxList(JSON.stringify({ venvs: {} }))).toEqual({});
    expect(parsePipxList(JSON.stringify({}))).toEqual({});
  });

  it('returns {} on empty or invalid json', () => {
    expect(parsePipxList('')).toEqual({});
    expect(parsePipxList('not json')).toEqual({});
  });
});
