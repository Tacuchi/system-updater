import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
// The harness exists to show Ink's interactive redraw, frame by frame. Ink reads
// CI once at import and, under CI, writes only the last frame; pin the
// interactive path so CI=true runs check the same frames as local runs.
vi.hoisted(() => { process.env['CI'] = 'false'; process.env['CONTINUOUS_INTEGRATION'] = 'false'; });
vi.mock('../../src/lib/config.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/config.js')>();
  return { ...original, loadConfig: () => original.normalizeConfig({ language: 'en' }) };
});
import { runBannerScreens, screens } from './banner-screens.js';
import { bannerSnapshot } from '../../src/lib/banner.js';
import { getLanguage } from '../../src/i18n/index.js';
import { ASCII } from '../../src/lib/glyphs.js';
import { CURSOR_IMAGE_ID, deleteImage, deletePlacement } from '../../src/lib/terminal-image.js';

const OK = '\x1b_Gi=31;OK\x1b\\';
const DA1 = '\x1b[?62;22c';
const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
const rows = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
afterEach(() => {
  if (columns) Object.defineProperty(process.stdout, 'columns', columns); else Reflect.deleteProperty(process.stdout, 'columns');
  if (rows) Object.defineProperty(process.stdout, 'rows', rows); else Reflect.deleteProperty(process.stdout, 'rows');
});
function terminal(answer: string) {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode(raw: boolean) { this.isRaw = raw; } });
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 30 });
  let written = '';
  output.on('data', chunk => {
    written += chunk.toString();
    if (chunk.toString().includes('\x1b[c')) setImmediate(() => input.write(answer));
  });
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 100 });
  Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 30 });
  return { input, output, read: () => written };
}

describe('banner visual check harness', () => {
  it('walks every screen and quits cleanly, with the image where glyphs and colour allow it', async () => {
    const io = terminal('\x1b]11;rgb:0000/0000/0000\x07' + OK + DA1);
    const shown: number[] = [];
    const result = await runBannerScreens({ ...io, env: { TERM_PROGRAM: 'ghostty' }, stepMs: 5, lang: 'es', onScreen: index => shown.push(index) });
    expect(shown).toEqual(screens.map((_, index) => index));
    expect(result.code).toBe(0);
    const written = io.read();
    expect(written).toContain('Paso 1/4');
    if (ASCII) {
      // The ASCII glyph set rules images out: the probe draws the mark as text and says why.
      expect(result.summary).toBe('banner: blocks art (6x3 cells) as text, no image: ascii; line header as the last frame');
      expect(written).not.toMatch(/\x1b_G|\u{10EEEE}/u);
      expect(written).toContain('███ ▄█');
    } else {
      expect(result.summary).toBe('banner: isotipo-terminal-oscuro (6x3 cells) by placeholders, theme dark; image deleted on exit');
      expect(written).toContain('\u{10EEEE}');
      expect(written).toMatch(/\x1b_Ga=d,d=I,i=\d+,q=2\x1b\\$/);
      expect(written.slice(written.lastIndexOf('\u{10EEEE}') + 1)).toContain('tacuchi');
    }
    expect(bannerSnapshot()).toBeNull();
  });
  it('draws the blocks without an answer, asks nothing more and still quits cleanly', async () => {
    const io = terminal(DA1);
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 5, lang: 'en' });
    expect(result.code).toBe(0);
    expect(result.summary).toBe(`banner: blocks art (6x3 cells) as text, no image: ${ASCII ? 'ascii' : 'no kitty graphics answer before DA1'}; line header as the last frame`);
    const written = io.read();
    expect(written).not.toMatch(/\x1b_Ga=[Tdp]|\u{10EEEE}/u);
    for (const row of ['██████', '███▀▀▀', '███ ▄█']) expect(written).toContain(row);
    expect(written).toContain('Step 1/4');
  });
  for (const [mode, art] of [['blocks', '███ ▄█'], ['ascii', '### _#']] as const) it(`draws the ${mode} art on request without asking for images`, async () => {
    const io = terminal(OK + DA1);
    const result = await runBannerScreens({ ...io, env: { TERM_PROGRAM: 'ghostty' }, stepMs: 5, lang: 'en', mode });
    expect(result.code).toBe(0);
    expect(result.summary).toBe(`banner: ${mode} art (6x3 cells) as text, no image: forced; line header as the last frame`);
    const written = io.read();
    expect(written).not.toMatch(/\x1b_G|\u{10EEEE}|\x1bP/u);
    expect(written).toContain(art);
  });
  it('keeps the line header in a narrow terminal', async () => {
    const io = terminal(OK + DA1);
    io.output.columns = 59;
    const result = await runBannerScreens({ ...io, env: { TERM_PROGRAM: 'ghostty' }, stepMs: 5, lang: 'en' });
    expect(result.summary).toBe('banner not shown: narrow; line header used');
    expect(io.read()).not.toMatch(/\x1b_G|\u{10EEEE}|███/u);
  });
  it('walks a screen taller than the terminal: Ink clears the screen and the image is sent again', async () => {
    expect(screens.some(screen => screen.body === 'taller')).toBe(true);
    expect(screens.some(screen => screen.note?.startsWith('resize the window now'))).toBe(true);
    const io = terminal(OK + DA1);
    // Ink writes at most one frame per 33 ms; each screen must outlast that to reach the terminal.
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 50, lang: 'en', mode: 'placeholders' });
    expect(result.code).toBe(0);
    if (ASCII) return;
    const written = io.read();
    const transmit = written.match(/\x1b_Ga=T,U=1,[^;]*;/)![0];
    expect(transmit).toContain(',c=6,r=3,');
    const afterClear = written.slice(written.indexOf('\x1b[2J'));
    expect(written).toContain('\x1b[2J');
    expect(afterClear).toContain(transmit);
  });
  it('runs the cursor tier: data sent once, placed after frames, removed while hidden, deleted on exit', async () => {
    const io = terminal('\x1b]11;rgb:0000/0000/0000\x07' + OK + DA1);
    const result = await runBannerScreens({ ...io, env: { TERM_PROGRAM: 'WarpTerminal' }, stepMs: 50, lang: 'en' });
    expect(result.code).toBe(0);
    const written = io.read();
    if (ASCII) { expect(written).not.toMatch(/\x1b_G[a-z]/); return; }
    expect(result.summary).toBe('banner: isotipo-terminal-oscuro (6x3 cells) by cursor, theme dark; image deleted on exit');
    expect(written.startsWith('\x1b]11;?\x07\x1b_Gi=31,')).toBe(true);
    expect(written).toContain('\x1b_Ga=t,f=100,t=d,i=31313,q=2,m=');
    expect(written).not.toContain('\u{10EEEE}');
    const placements = written.match(/\x1b_Ga=p,i=31313,p=1,c=6,r=3,C=1,q=2\x1b\\/g) ?? [];
    expect(placements.length).toBeGreaterThanOrEqual(3);
    // The taller screen hides it, the clear brings the data back, and the line header at exit removes it.
    expect(written).toContain(deletePlacement(CURSOR_IMAGE_ID, 1));
    expect(written.slice(written.indexOf('\x1b[2J'))).toContain('\x1b_Ga=t,f=100,t=d,i=31313');
    expect(written.endsWith(deleteImage(CURSOR_IMAGE_ID))).toBe(true);
  });
  it('runs the sixel tier on request: no kitty bytes, the image drawn after frames', async () => {
    const io = terminal('\x1b[6;20;10t\x1b[?61;4;6;7;22c');
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 5, lang: 'en', mode: 'sixel' });
    expect(result.code).toBe(0);
    const written = io.read();
    expect(written).not.toMatch(/\x1b_Ga=/);
    // With the ASCII glyph set no image can be drawn, so nothing is asked at all.
    if (ASCII) { expect(written).not.toContain('\x1b[16t'); return; }
    expect(written).toContain('\x1b[16t\x1b[c');
    expect(result.summary).toBe('banner: icono-terminal (6x3 cells) by sixel, theme dark (unknown); line header as the last frame');
    expect(written).toContain('\x1bP0;1;0q"1;1;60;60');
  });
  it('turns the banner off without asking for images', async () => {
    const io = terminal(OK + DA1);
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 5, lang: 'en', mode: 'off' });
    expect(result.summary).toBe('banner not shown: turned off; line header used');
    expect(io.read()).not.toMatch(/\x1b_G|\x1bP|███/);
  });
  it('quits early like Ctrl+C and uses the configured language by default', async () => {
    const io = terminal(OK + DA1);
    let quit: ((code: number) => void) | undefined;
    const pending = runBannerScreens({ ...io, env: {}, stepMs: 1000, onReady: fn => { quit = fn; } });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getLanguage()).toBe('en');
    quit!(130);
    expect((await pending).code).toBe(130);
  });
});
