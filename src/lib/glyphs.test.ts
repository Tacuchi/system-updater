import { describe, it, expect } from 'vitest';
import { shouldUseAscii } from './glyphs.js';

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe('shouldUseAscii', () => {
  it('honours the TACUCHI_ASCII override either way', () => {
    expect(shouldUseAscii(env({ TACUCHI_ASCII: '1', WT_SESSION: '1' }), 'darwin')).toBe(true);
    expect(shouldUseAscii(env({ TACUCHI_ASCII: '0' }), 'win32')).toBe(false);
  });

  it('falls back to ASCII on a dumb terminal', () => {
    expect(shouldUseAscii(env({ TERM: 'dumb' }), 'linux')).toBe(true);
  });

  it('falls back to ASCII on a legacy Windows console (no WT_SESSION)', () => {
    expect(shouldUseAscii(env({}), 'win32')).toBe(true);
  });

  it('uses Unicode in Windows Terminal', () => {
    expect(shouldUseAscii(env({ WT_SESSION: '1' }), 'win32')).toBe(false);
  });

  it('uses Unicode on macOS / Linux by default', () => {
    expect(shouldUseAscii(env({}), 'darwin')).toBe(false);
    expect(shouldUseAscii(env({}), 'linux')).toBe(false);
  });
});
