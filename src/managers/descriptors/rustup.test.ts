import { describe, it, expect } from 'vitest';
import { parseRustupCheck } from './rustup.js';

describe('parseRustupCheck', () => {
  it('parses a toolchain with an available update, dropping the hash/date', () => {
    const stdout =
      'stable-aarch64-apple-darwin - Update available : 1.77.0 (abcdef 2024-01-01) -> 1.78.0 (123456 2024-05-01)';
    expect(parseRustupCheck(stdout)).toEqual([
      { name: 'stable-aarch64-apple-darwin', currentVersion: '1.77.0', newVersion: '1.78.0' },
    ]);
  });

  it('parses multiple toolchains plus the rustup line, skipping up-to-date entries', () => {
    const stdout = [
      'stable-aarch64-apple-darwin - Update available : 1.77.0 (abcdef) -> 1.78.0 (123456)',
      'nightly-aarch64-apple-darwin - Up to date : 1.80.0-nightly (deadbeef 2024-05-02)',
      'beta-aarch64-apple-darwin - Update available : 1.79.0 (cafe) -> 1.79.1 (face)',
      'rustup - Update available : 1.26.0 -> 1.27.0',
    ].join('\n');
    expect(parseRustupCheck(stdout)).toEqual([
      { name: 'stable-aarch64-apple-darwin', currentVersion: '1.77.0', newVersion: '1.78.0' },
      { name: 'beta-aarch64-apple-darwin', currentVersion: '1.79.0', newVersion: '1.79.1' },
      { name: 'rustup', currentVersion: '1.26.0', newVersion: '1.27.0' },
    ]);
  });

  it('captures the rustup binary update with no trailing hashes', () => {
    expect(parseRustupCheck('rustup - Update available : 1.26.0 -> 1.27.0')).toEqual([
      { name: 'rustup', currentVersion: '1.26.0', newVersion: '1.27.0' },
    ]);
  });

  it('returns [] when everything is up to date', () => {
    const stdout = [
      'stable-aarch64-apple-darwin - Up to date : 1.78.0 (123456 2024-05-01)',
      'rustup - Up to date : 1.27.0',
    ].join('\n');
    expect(parseRustupCheck(stdout)).toEqual([]);
  });

  it('returns [] on empty output', () => {
    expect(parseRustupCheck('')).toEqual([]);
  });

  it('ignores noise/info lines that are not update entries', () => {
    const stdout = [
      'info: checking for updates',
      'stable-x86_64-unknown-linux-gnu - Update available : 1.70.0 (90c541806 2023-05-31) -> 1.71.0 (8ede3aae2 2023-07-12)',
    ].join('\n');
    expect(parseRustupCheck(stdout)).toEqual([
      { name: 'stable-x86_64-unknown-linux-gnu', currentVersion: '1.70.0', newVersion: '1.71.0' },
    ]);
  });
});
