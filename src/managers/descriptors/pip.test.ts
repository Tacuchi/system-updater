import { describe, it, expect } from 'vitest';
import { parsePipOutdated } from './pip.js';

describe('parsePipOutdated', () => {
  it('parses pip list --outdated --format=json', () => {
    const json = JSON.stringify([
      { name: 'requests', version: '2.28.0', latest_version: '2.31.0' },
      { name: 'numpy', version: '1.24.0', latest_version: '1.26.0' },
    ]);
    expect(parsePipOutdated(json)).toEqual([
      { name: 'requests', currentVersion: '2.28.0', newVersion: '2.31.0' },
      { name: 'numpy', currentVersion: '1.24.0', newVersion: '1.26.0' },
    ]);
  });

  it('returns [] on invalid json', () => {
    expect(parsePipOutdated('boom')).toEqual([]);
  });
});
