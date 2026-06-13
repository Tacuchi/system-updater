import { describe, it, expect } from 'vitest';
import { parseGoVersion, parseLatestGoVersion } from './go-lang.js';

describe('parseGoVersion', () => {
  it('extracts the version from `go version` output', () => {
    expect(parseGoVersion('go version go1.21.5 darwin/arm64')).toBe('1.21.5');
  });

  it('extracts the version from a linux `go version` line', () => {
    expect(parseGoVersion('go version go1.22.0 linux/amd64')).toBe('1.22.0');
  });

  it('returns undefined when there is no version token', () => {
    expect(parseGoVersion('command not found: go')).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(parseGoVersion('')).toBeUndefined();
  });
});

describe('parseLatestGoVersion', () => {
  it('parses the go.dev VERSION?m=text body (first line is the version)', () => {
    // Real body shape: a "go<version>" line followed by a timestamp line.
    const body = 'go1.22.0\ntime 2024-02-06T18:13:01Z\n';
    expect(parseLatestGoVersion(body)).toBe('1.22.0');
  });

  it('handles a body with only the version line and no trailing newline', () => {
    expect(parseLatestGoVersion('go1.21.5')).toBe('1.21.5');
  });

  it('returns undefined for an empty body', () => {
    expect(parseLatestGoVersion('')).toBeUndefined();
  });

  it('returns undefined when the first line is blank', () => {
    expect(parseLatestGoVersion('\ntime 2024-02-06T18:13:01Z\n')).toBeUndefined();
  });
});
