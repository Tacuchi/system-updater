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
  it('walks every screen and quits cleanly, with the banner where glyphs and colour are on', async () => {
    const io = terminal('\x1b]11;rgb:0000/0000/0000\x07' + OK + DA1);
    const shown: number[] = [];
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 5, lang: 'es', onScreen: index => shown.push(index) });
    expect(shown).toEqual(screens.map((_, index) => index));
    expect(result.code).toBe(0);
    const written = io.read();
    if (ASCII) {
      // The probe does not draw the banner in ASCII mode, and says why.
      expect(result.summary).toBe('banner not shown: ascii; line header used');
      expect(written).not.toMatch(/\x1b_Ga=[Td]|\u{10EEEE}/u);
      expect(written).toContain('Paso 1/4');
    } else {
      expect(result.summary).toMatch(/^banner: isotipo-terminal-oscuro \(8x3 cells\), theme dark; image deleted on exit$/);
      // NO_COLOR is read from the process at render time, like the app: the image is sent, the header stays one line.
      expect(written.includes('\u{10EEEE}')).toBe(process.env['NO_COLOR'] === undefined);
      expect(written).toContain('Paso 1/4');
      expect(written).toMatch(/\x1b_Ga=d,d=I,i=\d+,q=2\x1b\\$/);
      expect(written.slice(written.lastIndexOf('\u{10EEEE}') + 1)).toContain('tacuchi');
    }
    expect(bannerSnapshot()).toBeNull();
  });
  it('falls back to the line header and still quits cleanly without an answer', async () => {
    const io = terminal(DA1);
    const result = await runBannerScreens({ ...io, env: {}, stepMs: 5, lang: 'en' });
    expect(result.code).toBe(0);
    expect(result.summary).toMatch(/^banner not shown: /);
    expect(io.read()).not.toMatch(/\x1b_Ga=[Td]|\u{10EEEE}/u);
    expect(io.read()).toContain('Step 1/4');
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
