import { describe, it, expect } from 'vitest';
import { parseComposerOutdated } from './composer.js';

describe('parseComposerOutdated', () => {
  it('parses installed entries into outdated packages', () => {
    // Representative `composer global outdated --format=json --direct` output.
    const json = JSON.stringify({
      installed: [
        {
          name: 'phpunit/phpunit',
          version: '10.5.0',
          latest: '11.0.1',
          'latest-status': 'semver-safe-update',
          description: 'The PHP Unit Testing framework.',
        },
        {
          name: 'symfony/console',
          version: 'v6.4.0',
          latest: 'v7.0.3',
          'latest-status': 'update-possible',
        },
      ],
    });
    const out = parseComposerOutdated(json);
    expect(out).toEqual([
      { name: 'phpunit/phpunit', currentVersion: '10.5.0', newVersion: '11.0.1' },
      { name: 'symfony/console', currentVersion: 'v6.4.0', newVersion: 'v7.0.3' },
    ]);
  });

  it('returns [] when nothing is installed/outdated', () => {
    expect(parseComposerOutdated(JSON.stringify({ installed: [] }))).toEqual([]);
  });

  it('returns [] when the installed key is missing', () => {
    expect(parseComposerOutdated(JSON.stringify({}))).toEqual([]);
  });

  it('returns [] on empty or invalid json', () => {
    expect(parseComposerOutdated('')).toEqual([]);
    expect(parseComposerOutdated('not json')).toEqual([]);
  });
});
