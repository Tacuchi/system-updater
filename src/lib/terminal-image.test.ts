import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  BANNER_MIN_COLUMNS, BANNER_MIN_ROWS, KITTY_QUERY, answersImages, bannerBlocker, deleteImage, pickPiece,
  placeholderRows, transmitImage,
} from './terminal-image.js';
import { probeTerminal, THEME_TIMEOUT_MS } from './terminal-theme.js';
import { darkIsotype, icon, lightIsotype } from './brand-images.js';

const OK = '\x1b_Gi=31;OK\x1b\\';
const DA1 = '\x1b[?62;22c';
function tty() {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(raw: boolean) { this.isRaw = raw; } });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  return { input, output };
}

describe('kitty graphics support detection', () => {
  it('counts only an OK answer that arrives before the device attributes reply', () => {
    expect(answersImages(OK + DA1)).toBe(true);
    expect(answersImages('\x1b]11;rgb:0000/0000/0000\x07' + OK + DA1)).toBe(true);
    expect(answersImages(DA1)).toBe(false);
    expect(answersImages('')).toBe(false);
    expect(answersImages(DA1 + OK)).toBe(false);
    expect(answersImages('\x1b_Gi=31;EINVAL:unsupported format\x1b\\' + DA1)).toBe(false);
    expect(answersImages('\x1b_Gi=7;OK\x1b\\' + DA1)).toBe(false);
  });
  it('asks with a one-pixel query that the terminal does not store', () => {
    expect(KITTY_QUERY).toBe('\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\');
  });
  it('reports support when the answer comes before DA1, inside the same bounded wait', async () => {
    const { input, output } = tty();
    const pending = probeTerminal({ input, output, interactive: true, env: {}, images: true });
    expect(output.read()?.toString()).toBe('\x1b]11;?\x07' + KITTY_QUERY + '\x1b[c');
    input.write('\x1b]11;rgb:0000/0000/0000\x07' + OK + DA1);
    expect(await pending).toEqual({ theme: 'dark', themeKnown: true, images: true });
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('data')).toBe(0);
  });
  it('reports no support and keeps the time limit when nothing answers', async () => {
    const { input, output } = tty();
    const start = Date.now();
    expect(await probeTerminal({ input, output, interactive: true, env: {}, images: true })).toEqual({ theme: 'dark', themeKnown: false, images: false });
    expect(Date.now() - start).toBeLessThan(THEME_TIMEOUT_MS + 100);
    expect(input.isRaw).toBe(false);
  });
  it('ignores an answer that arrives after DA1 or after the time limit', async () => {
    const first = tty();
    const sameChunk = probeTerminal({ ...first, interactive: true, env: {}, images: true });
    first.input.write(DA1 + OK);
    expect((await sameChunk).images).toBe(false);
    const second = tty();
    const late = probeTerminal({ ...second, interactive: true, env: {}, images: true });
    setTimeout(() => second.input.write(OK + DA1), THEME_TIMEOUT_MS + 50);
    expect((await late).images).toBe(false);
    expect(second.input.listenerCount('data')).toBe(0);
  });
  it('still asks for images when COLORFGBG already gives the theme', async () => {
    const { input, output } = tty();
    const pending = probeTerminal({ input, output, interactive: true, env: { COLORFGBG: '0;15' }, images: true });
    expect(output.read()?.toString()).toBe(KITTY_QUERY + '\x1b[c');
    input.write(OK + DA1);
    expect(await pending).toEqual({ theme: 'light', themeKnown: true, images: true });
  });
  it('never sends the graphics query when the banner is not wanted', async () => {
    const { input, output } = tty();
    const pending = probeTerminal({ input, output, interactive: true, env: {}, images: false });
    expect(output.read()?.toString()).toBe('\x1b]11;?\x07\x1b[c');
    input.write(DA1);
    expect((await pending).images).toBe(false);
  });
});

describe('banner piece by theme', () => {
  it('uses the isotype for a known theme and the icon with its own tile otherwise', () => {
    expect(pickPiece('dark', true)).toMatchObject({ name: 'isotipo-terminal-oscuro', png: darkIsotype, columns: 8, rows: 3 });
    expect(pickPiece('light', true)).toMatchObject({ name: 'isotipo-terminal-claro', png: lightIsotype, columns: 8, rows: 3 });
    expect(pickPiece('dark', false)).toMatchObject({ name: 'icono-terminal', png: icon, columns: 6, rows: 3 });
    expect(pickPiece('light', false).name).toBe('icono-terminal');
  });
  it('embeds real PNG files with the official sizes', () => {
    for (const [png, width, height] of [[darkIsotype, 368, 312], [lightIsotype, 368, 312], [icon, 192, 192]] as const) {
      const bytes = Buffer.from(png, 'base64');
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
    }
  });
});

describe('banner fallback conditions', () => {
  const ok = { env: {}, stdoutTTY: true, ascii: false, columns: 100, rows: 30 };
  it('allows the banner only in a capable, large enough terminal', () => {
    expect(bannerBlocker(ok)).toBeNull();
    expect(bannerBlocker({ ...ok, columns: BANNER_MIN_COLUMNS, rows: BANNER_MIN_ROWS })).toBeNull();
  });
  it.each([
    ['not-tty', { stdoutTTY: false }],
    ['no-color', { env: { NO_COLOR: '' } }],
    ['ascii', { ascii: true }],
    ['multiplexer', { env: { TMUX: '/tmp/tmux-1/default,1,0' } }],
    ['multiplexer', { env: { STY: '1234.pts-0.host' } }],
    ['multiplexer', { env: { TERM: 'screen-256color' } }],
    ['multiplexer', { env: { TERM: 'tmux-256color' } }],
    ['narrow', { columns: 59 }],
    ['short', { rows: 18 }],
  ])('falls back to the line header: %s', (reason, change) => {
    expect(bannerBlocker({ ...ok, ...change })).toBe(reason);
  });
  it('needs the tallest bounded screen plus the two extra banner rows', () => {
    expect(BANNER_MIN_COLUMNS).toBe(60);
    expect(BANNER_MIN_ROWS).toBe(17 + 2);
  });
});

describe('kitty graphics commands', () => {
  it('transmits a PNG once as a quiet virtual placement sized in cells', () => {
    expect(transmitImage(42, { png: 'QUJD', columns: 8, rows: 3 })).toBe('\x1b_Ga=T,U=1,f=100,t=d,i=42,c=8,r=3,C=1,q=2,m=0;QUJD\x1b\\');
  });
  it('splits the payload in chunks of 4096 bytes', () => {
    const png = 'A'.repeat(4096) + 'B'.repeat(4096) + 'C'.repeat(8);
    expect(transmitImage(7, { png, columns: 6, rows: 3 })).toBe(
      `\x1b_Ga=T,U=1,f=100,t=d,i=7,c=6,r=3,C=1,q=2,m=1;${'A'.repeat(4096)}\x1b\\`
      + `\x1b_Gm=1;${'B'.repeat(4096)}\x1b\\`
      + '\x1b_Gm=0;CCCCCCCC\x1b\\',
    );
  });
  it('deletes the image and frees its data', () => {
    expect(deleteImage(42)).toBe('\x1b_Ga=d,d=I,i=42,q=2\x1b\\');
  });
  it('writes each placeholder cell with its row and column diacritics in the image color', () => {
    const rows = placeholderRows(42, 2, 3);
    expect(rows).toEqual([
      '\x1b[38;5;42m\u{10EEEE}̅̅\u{10EEEE}̅̍\x1b[39m',
      '\x1b[38;5;42m\u{10EEEE}̍̅\u{10EEEE}̍̍\x1b[39m',
      '\x1b[38;5;42m\u{10EEEE}̎̅\u{10EEEE}̎̍\x1b[39m',
    ]);
    expect(placeholderRows(9, 8, 3)[0]).toContain('\u{10EEEE}̅̿');
  });
});
