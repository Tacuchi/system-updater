import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  BANNER_MIN_COLUMNS, BANNER_MIN_ROWS, CELL_SIZE_QUERY, CURSOR_IMAGE_ID, CURSOR_PLACEMENT_ID, IMAGE_COLUMN, KITTY_QUERY,
  MARK_COLUMNS, MARK_ROWS, SIXEL_BY_DEFAULT, answersImages, bannerBlocker, bannerWanted, cellSize, deleteImage, deletePlacement,
  drawSixel, forcedTier, imageBlocker, imagesWanted, listsSixel, pickPiece, pickTier, placeImage, placeholderRows, resolveTier,
  sixelPossible, textTier, transmitData, transmitImage,
} from './terminal-image.js';
import { shouldUseAscii } from './glyphs.js';
import { probeTerminal, THEME_TIMEOUT_MS } from './terminal-theme.js';
import { darkIsotype, darkIsotypeBitmap, icon, iconBitmap, lightIsotype, lightIsotypeBitmap } from './brand-images.js';

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
    expect(await pending).toEqual({ theme: 'dark', themeKnown: true, images: true, sixel: false, cell: null });
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('data')).toBe(0);
  });
  it('reports no support and keeps the time limit when nothing answers', async () => {
    const { input, output } = tty();
    const start = Date.now();
    expect(await probeTerminal({ input, output, interactive: true, env: {}, images: true })).toEqual({ theme: 'dark', themeKnown: false, images: false, sixel: false, cell: null });
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
    expect(await pending).toEqual({ theme: 'light', themeKnown: true, images: true, sixel: false, cell: null });
  });
  it('never sends the graphics query when the banner is not wanted', async () => {
    const { input, output } = tty();
    const pending = probeTerminal({ input, output, interactive: true, env: {}, images: false });
    expect(output.read()?.toString()).toBe('\x1b]11;?\x07\x1b[c');
    input.write(DA1);
    expect((await pending).images).toBe(false);
  });
});

describe('sixel and cell size answers', () => {
  const WT_SIXEL = '\x1b[?61;4;6;7;14;21;22;23;24;28;32;42c';
  it('reads sixel from attribute 4 of the DA1 reply only', () => {
    expect(listsSixel(WT_SIXEL)).toBe(true);
    expect(listsSixel('\x1b[?61;6;7;14;21;22;23;24;28;32;42c')).toBe(false);
    expect(listsSixel('\x1b[?62;22;44c')).toBe(false);
    expect(listsSixel(DA1)).toBe(false);
    expect(listsSixel('')).toBe(false);
  });
  it('reads the cell size only when it comes before DA1', () => {
    expect(cellSize('\x1b[6;20;10t' + DA1)).toEqual({ width: 10, height: 20 });
    expect(cellSize(DA1 + '\x1b[6;20;10t')).toBeNull();
    expect(cellSize('\x1b[6;0;0t' + DA1)).toBeNull();
    expect(cellSize(DA1)).toBeNull();
  });
  it('asks the cell size in the same bounded wait only when sixel can be chosen', async () => {
    const { input, output } = tty();
    const pending = probeTerminal({ input, output, interactive: true, env: {}, images: true, cell: true });
    expect(output.read()?.toString()).toBe('\x1b]11;?\x07' + KITTY_QUERY + CELL_SIZE_QUERY + '\x1b[c');
    input.write('\x1b]11;rgb:0c0c/0c0c/0c0c\x07\x1b[6;19;9t' + WT_SIXEL);
    expect(await pending).toEqual({ theme: 'dark', themeKnown: true, images: false, sixel: true, cell: { width: 9, height: 19 } });
    expect(CELL_SIZE_QUERY).toBe('\x1b[16t');
  });
  it('turns the cell query on only for a sixel that can be used', () => {
    expect(SIXEL_BY_DEFAULT).toBe(false);
    expect(sixelPossible({})).toBe(false);
    expect(sixelPossible({ TACUCHI_BANNER: 'sixel' })).toBe(true);
  });
});

/** Recorded answers: the measured terminals and the ones inferred from their documentation. */
const WARP_DA1 = '\x1b[?62c';
const WT_DA1 = '\x1b[?61;6;7;14;21;22;23;24;28;32;42c';
const WT_SIXEL_DA1 = '\x1b[?61;4;6;7;14;21;22;23;24;28;32;42c';
type Fixture = readonly [name: string, env: NodeJS.ProcessEnv, response: string, platform: NodeJS.Platform, tier: string];
const fixtures: readonly Fixture[] = [
  ['Herdr', { TERM_PROGRAM: 'ghostty', TERM: 'xterm-256color' }, OK + DA1, 'darwin', 'placeholders'],
  ['Ghostty 1.4', { TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty' }, OK + '\x1b[?62;22;52c', 'darwin', 'placeholders'],
  ['kitty', { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }, OK + DA1, 'linux', 'placeholders'],
  ['Warp', { TERM_PROGRAM: 'WarpTerminal', TERM: 'xterm-256color' }, OK + WARP_DA1, 'darwin', 'cursor'],
  ['WezTerm', { TERM_PROGRAM: 'WezTerm', TERM: 'xterm-256color' }, OK + '\x1b[?65;4;6;18;22c', 'linux', 'cursor'],
  ['Konsole', { TERM: 'xterm-256color', KONSOLE_VERSION: '240802' }, OK + '\x1b[?62;22c', 'linux', 'cursor'],
  ['macOS Terminal', { TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color' }, '\x1b[?1;2c', 'darwin', 'blocks'],
  ['iTerm-like', { TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' }, '\x1b[?62;4c', 'darwin', 'blocks'],
  ['PowerShell in Windows Terminal without sixel', { WT_SESSION: 'x' }, WT_DA1, 'win32', 'blocks'],
  ['PowerShell in Windows Terminal with sixel', { WT_SESSION: 'x' }, WT_SIXEL_DA1, 'win32', 'blocks'],
  ['PowerShell in a classic console', {}, '', 'win32', 'blocks'],
  ['Ghostty with NO_COLOR', { TERM_PROGRAM: 'ghostty', NO_COLOR: '1' }, OK + DA1, 'darwin', 'blocks'],
  ['Windows Terminal with NO_COLOR', { WT_SESSION: 'x', NO_COLOR: '' }, WT_DA1, 'win32', 'blocks'],
  ['Ghostty with TACUCHI_ASCII=1', { TERM_PROGRAM: 'ghostty', TACUCHI_ASCII: '1' }, OK + DA1, 'darwin', 'ascii'],
  ['classic console with TACUCHI_ASCII=1', { TACUCHI_ASCII: '1' }, '', 'win32', 'ascii'],
  ['tmux inside Ghostty', { TERM_PROGRAM: 'tmux', TERM: 'tmux-256color', TMUX: '/tmp/tmux-1/default,1,0' }, OK + DA1, 'darwin', 'blocks'],
  ['GNU screen', { TERM: 'screen-256color', STY: '1234.pts-0.host' }, DA1, 'linux', 'blocks'],
];

/** The whole decision, as the entry point makes it: what to ask, then the tier from the answers. */
function decide(env: NodeJS.ProcessEnv, response: string, platform: NodeJS.Platform, size: Partial<{ interactive: boolean; stdoutTTY: boolean; columns: number; rows: number }> = {}) {
  const run = { interactive: true, stdoutTTY: true, columns: 100, rows: 30, ...size };
  const ascii = shouldUseAscii(env, platform);
  const asked = imagesWanted({ env, ascii, ...run });
  return resolveTier({ env, ascii, ...run, images: asked && answersImages(response), sixel: asked && listsSixel(response) });
}

describe('banner tier by terminal', () => {
  it.each(fixtures)('%s', (_name, env, response, platform, tier) => {
    expect(decide(env, response, platform)).toBe(tier);
  });
  it('keeps the one-line header with redirected output, in a narrow terminal and in a short one', () => {
    for (const [, env, response, platform] of fixtures) {
      expect(decide(env, response, platform, { stdoutTTY: false })).toBe('none');
      expect(decide(env, response, platform, { columns: 59 })).toBe('none');
      expect(decide(env, response, platform, { rows: 18 })).toBe('none');
    }
  });
  it('draws the blocks, not an image, when the run is not interactive but stdout is a terminal', () => {
    expect(decide({ TERM_PROGRAM: 'ghostty' }, OK + DA1, 'darwin', { interactive: false })).toBe('blocks');
    expect(imagesWanted({ env: { TERM_PROGRAM: 'ghostty' }, ascii: false, interactive: false, stdoutTTY: true, columns: 100, rows: 30 })).toBe(false);
  });
  it('asks the terminal for images only where an image could be drawn', () => {
    const run = { interactive: true, stdoutTTY: true, columns: 100, rows: 30 };
    expect(imagesWanted({ env: {}, ascii: false, ...run })).toBe(true);
    expect(imagesWanted({ env: { NO_COLOR: '1' }, ascii: false, ...run })).toBe(false);
    expect(imagesWanted({ env: {}, ascii: true, ...run })).toBe(false);
    expect(imagesWanted({ env: { TMUX: 't' }, ascii: false, ...run })).toBe(false);
    expect(imagesWanted({ env: { TACUCHI_BANNER: 'blocks' }, ascii: false, ...run })).toBe(false);
    expect(imagesWanted({ env: { TACUCHI_BANNER: 'ascii' }, ascii: false, ...run })).toBe(false);
    expect(imagesWanted({ env: { TACUCHI_BANNER: 'off' }, ascii: false, ...run })).toBe(false);
    expect(imagesWanted({ env: {}, ascii: false, ...run, columns: 59 })).toBe(false);
  });
  it('names why an image cannot be drawn', () => {
    expect(imageBlocker({ env: {}, interactive: true, ascii: false })).toBeNull();
    expect(imageBlocker({ env: {}, interactive: false, ascii: false })).toBe('not-interactive');
    expect(imageBlocker({ env: { NO_COLOR: '' }, interactive: true, ascii: false })).toBe('no-color');
    expect(imageBlocker({ env: {}, interactive: true, ascii: true })).toBe('ascii');
    expect(imageBlocker({ env: { STY: 's' }, interactive: true, ascii: false })).toBe('multiplexer');
  });
  it('uses the ASCII art only when TACUCHI_ASCII=1 is set explicitly', () => {
    expect(textTier({ TACUCHI_ASCII: '1' })).toBe('ascii');
    expect(textTier({})).toBe('blocks');
    expect(textTier({ TACUCHI_ASCII: '0' })).toBe('blocks');
    // TERM=dumb and the classic console turn the ASCII glyph set on, not the ASCII art.
    expect(textTier({ TERM: 'dumb' })).toBe('blocks');
  });
  it('turns sixel on only by request while it is opt-in', () => {
    for (const [, env, response] of fixtures.filter(([name]) => name.includes('with sixel') || name === 'iTerm-like')) {
      expect(pickTier({ env: { ...env, TACUCHI_BANNER: 'sixel' }, images: answersImages(response), sixel: listsSixel(response), textOnly: false })).toBe('sixel');
    }
  });
  it('lets TACUCHI_BANNER force a tier or turn the banner off, and ignores other values', () => {
    const warp = { TERM_PROGRAM: 'WarpTerminal' };
    const pick = (env: NodeJS.ProcessEnv, images: boolean, textOnly = false) => pickTier({ env, images, sixel: false, textOnly });
    expect(pick({ ...warp, TACUCHI_BANNER: 'placeholders' }, true)).toBe('placeholders');
    expect(pick({ TERM_PROGRAM: 'ghostty', TACUCHI_BANNER: 'cursor' }, true)).toBe('cursor');
    expect(pick({ ...warp, TACUCHI_BANNER: 'off' }, true)).toBe('none');
    expect(pick({ ...warp, TACUCHI_BANNER: ' Cursor ' }, false)).toBe('cursor');
    expect(pick({ ...warp, TACUCHI_BANNER: 'yes' }, true)).toBe('cursor');
    expect(pick({ ...warp, TACUCHI_BANNER: 'blocks' }, true)).toBe('blocks');
    expect(pick({ ...warp, TACUCHI_BANNER: 'ASCII' }, true)).toBe('ascii');
    expect(forcedTier({ TACUCHI_BANNER: '' })).toBeNull();
    expect(forcedTier({ TACUCHI_BANNER: 'blocks' })).toBe('blocks');
    expect(forcedTier({ TACUCHI_BANNER: 'ascii' })).toBe('ascii');
  });
  it('turns a forced image tier into text where images cannot be drawn', () => {
    const pick = (env: NodeJS.ProcessEnv) => pickTier({ env, images: true, sixel: true, textOnly: true });
    expect(pick({ TACUCHI_BANNER: 'placeholders' })).toBe('blocks');
    expect(pick({ TACUCHI_BANNER: 'sixel', TACUCHI_ASCII: '1' })).toBe('ascii');
    expect(pick({ TACUCHI_BANNER: 'off' })).toBe('none');
    // An explicit text form wins over TACUCHI_ASCII.
    expect(pick({ TACUCHI_BANNER: 'blocks', TACUCHI_ASCII: '1' })).toBe('blocks');
  });
  it('keeps every line-header condition above a forced tier', () => {
    const ok = { stdoutTTY: true, columns: 100, rows: 30 };
    const forced = { TACUCHI_BANNER: 'sixel' };
    expect(bannerWanted({ env: forced, ...ok })).toBe(true);
    expect(bannerWanted({ env: { TACUCHI_BANNER: 'off' }, ...ok })).toBe(false);
    expect(bannerWanted({ env: forced, ...ok, stdoutTTY: false })).toBe(false);
    expect(bannerWanted({ env: forced, ...ok, columns: 59 })).toBe(false);
    expect(bannerWanted({ env: forced, ...ok, rows: 18 })).toBe(false);
    // Colour, glyphs and multiplexers change the form, not whether there is a mark.
    expect(bannerWanted({ env: { ...forced, NO_COLOR: '1', TMUX: 't' }, ...ok })).toBe(true);
  });
});

describe('banner piece by theme', () => {
  it('uses the isotype for a known theme and the icon with its own tile otherwise', () => {
    expect(pickPiece('dark', true)).toMatchObject({ name: 'isotipo-terminal-oscuro', png: darkIsotype, bitmap: darkIsotypeBitmap, columns: 6, rows: 3 });
    expect(pickPiece('light', true)).toMatchObject({ name: 'isotipo-terminal-claro', png: lightIsotype, bitmap: lightIsotypeBitmap, columns: 6, rows: 3 });
    expect(pickPiece('dark', false)).toMatchObject({ name: 'icono-terminal', png: icon, bitmap: iconBitmap, columns: 6, rows: 3 });
    expect(pickPiece('light', false).name).toBe('icono-terminal');
  });
  it('reserves 6 x 3 cells for every piece, the footprint of the text forms too', () => {
    expect([MARK_COLUMNS, MARK_ROWS]).toEqual([6, 3]);
    for (const piece of [pickPiece('dark', true), pickPiece('light', true), pickPiece('dark', false)]) {
      expect([piece.columns, piece.rows]).toEqual([MARK_COLUMNS, MARK_ROWS]);
    }
  });
  it('embeds real PNG files with the official sizes', () => {
    for (const [png, width, height] of [[darkIsotype, 312, 312], [lightIsotype, 312, 312], [icon, 192, 192]] as const) {
      const bytes = Buffer.from(png, 'base64');
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
    }
  });
});

describe('line header conditions', () => {
  const ok = { stdoutTTY: true, columns: 100, rows: 30 };
  it('allows the mark only on a terminal large enough', () => {
    expect(bannerBlocker(ok)).toBeNull();
    expect(bannerBlocker({ ...ok, columns: BANNER_MIN_COLUMNS, rows: BANNER_MIN_ROWS })).toBeNull();
  });
  it.each([
    ['not-tty', { stdoutTTY: false }],
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
  it('transmits only the data for the cursor tier, in the same chunks', () => {
    expect(transmitData(CURSOR_IMAGE_ID, 'QUJD')).toBe('\x1b_Ga=t,f=100,t=d,i=31313,q=2,m=0;QUJD\x1b\\');
    expect(transmitData(5, 'A'.repeat(4097))).toBe(`\x1b_Ga=t,f=100,t=d,i=5,q=2,m=1;${'A'.repeat(4096)}\x1b\\\x1b_Gm=0;A\x1b\\`);
  });
  it('places at the header cell with a fixed placement id, cursor saved and kept', () => {
    expect(IMAGE_COLUMN).toBe(2);
    expect(CURSOR_PLACEMENT_ID).toBe(1);
    expect(placeImage({ id: 31313, placement: 1, columns: 8, rows: 3, up: 12 }))
      .toBe('\x1b7\x1b[12A\x1b[3G\x1b_Ga=p,i=31313,p=1,c=8,r=3,C=1,q=2\x1b\\\x1b8');
    // CSI 0 A moves one row in some terminals, so a frame on the cursor row sends no move.
    expect(placeImage({ id: 31313, placement: 1, columns: 6, rows: 3, up: 0 }))
      .toBe('\x1b7\x1b[3G\x1b_Ga=p,i=31313,p=1,c=6,r=3,C=1,q=2\x1b\\\x1b8');
  });
  it('removes one placement and keeps the data', () => {
    expect(deletePlacement(31313, 1)).toBe('\x1b_Ga=d,d=i,i=31313,p=1,q=2\x1b\\');
  });
  it('draws a sixel at the header cell with the cursor saved', () => {
    expect(drawSixel('\x1bPq#1~\x1b\\', 4)).toBe('\x1b7\x1b[4A\x1b[3G\x1bPq#1~\x1b\\\x1b8');
    expect(drawSixel('S', 0)).toBe('\x1b7\x1b[3GS\x1b8');
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
