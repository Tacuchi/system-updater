import { describe, it, expect } from 'vitest';
import { parseBunGlobalList } from './bun.js';

describe('parseBunGlobalList', () => {
  it('parses a `bun pm ls -g` tree into a name -> version map', () => {
    const stdout = [
      '/Users/me/.bun/install/global node_modules (3)',
      '├── typescript@5.3.3',
      '├── prettier@3.1.0',
      '└── @angular/cli@17.0.0',
    ].join('\n');
    expect(parseBunGlobalList(stdout)).toEqual(
      new Map([
        ['typescript', '5.3.3'],
        ['prettier', '3.1.0'],
        ['@angular/cli', '17.0.0'],
      ]),
    );
  });

  it('keeps the leading @ on scoped packages by splitting on the LAST @', () => {
    const stdout = '└── @scope/pkg@1.2.3';
    expect(parseBunGlobalList(stdout)).toEqual(new Map([['@scope/pkg', '1.2.3']]));
  });

  it('skips the header path line (no @version)', () => {
    const stdout = ['/home/u/.bun/install/global node_modules (1)', '└── esbuild@0.19.5'].join('\n');
    expect(parseBunGlobalList(stdout)).toEqual(new Map([['esbuild', '0.19.5']]));
  });

  it('handles deep tree connectors and extra whitespace', () => {
    const stdout = ['│   ├── lodash@4.17.21', '    └── chalk@5.3.0'].join('\n');
    expect(parseBunGlobalList(stdout)).toEqual(
      new Map([
        ['lodash', '4.17.21'],
        ['chalk', '5.3.0'],
      ]),
    );
  });

  it('ignores entries whose version token is not version-shaped', () => {
    // a bare `@scope` with no version, and a non-numeric "version".
    const stdout = ['├── @scope', '├── weird@notaversion', '└── ok@2.0.0'].join('\n');
    expect(parseBunGlobalList(stdout)).toEqual(new Map([['ok', '2.0.0']]));
  });

  it('returns an empty map for empty / blank output', () => {
    expect(parseBunGlobalList('')).toEqual(new Map());
    expect(parseBunGlobalList('\n\n  \n')).toEqual(new Map());
  });

  it('ignores trailing metadata after the version token', () => {
    const stdout = '├── typescript@5.3.3 deduped';
    expect(parseBunGlobalList(stdout)).toEqual(new Map([['typescript', '5.3.3']]));
  });
});
