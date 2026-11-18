import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { detectTerminalTheme, parseTerminalTheme } from './terminal-theme.js';
describe('reported terminal theme', () => {
  it('reads recorded OSC 11 and COLORFGBG responses', () => {
    expect(parseTerminalTheme('0;15')).toBe('light');
    expect(parseTerminalTheme('15;0')).toBe('dark');
    expect(parseTerminalTheme('15;8')).toBe('dark');
    expect(parseTerminalTheme('15;9')).toBe('dark');
    expect(parseTerminalTheme('0;999')).toBe('dark');
    expect(parseTerminalTheme(undefined, '\x1b]11;rgb:ffff/ffff/ffff\x1b\\')).toBe('light');
    expect(parseTerminalTheme(undefined, '\x1b]11;rgb:0000/0000/0000\x07')).toBe('dark');
    expect(parseTerminalTheme(undefined, '\x1b[?1;2c')).toBe('dark');
  });
  it('falls back immediately off TTY without writing queries', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    expect(await detectTerminalTheme({ input, output, interactive: true, env: {} })).toBe('dark');
    expect(output.read()).toBeNull();
  });
  it('bounds waiting and restores input state when there is no answer', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(raw: boolean) { this.isRaw = raw; } });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    const start = Date.now();
    expect(await detectTerminalTheme({ input, output, interactive: true, env: {} })).toBe('dark');
    expect(Date.now() - start).toBeLessThan(250);
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('data')).toBe(0);
  });
  it('finishes on DA1 after consuming the background response', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(raw: boolean) { this.isRaw = raw; } });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    const pending = detectTerminalTheme({ input, output, interactive: true, env: {} });
    input.write('\x1b]11;rgb:ffff/ffff/ffff\x07\x1b[?1;2c');
    expect(await pending).toBe('light');
    expect(input.isRaw).toBe(false);
  });
});
