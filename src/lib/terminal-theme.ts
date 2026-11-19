import type { Readable, Writable } from 'node:stream';
import type { TerminalTheme } from '../theme.js';
import { KITTY_QUERY, answersImages } from './terminal-image.js';
export const THEME_TIMEOUT_MS = 150;
export function parseTerminalTheme(colorfgbg?: string, response = ''): TerminalTheme {
  const palette = colorfgbg?.split(';').at(-1);
  if (palette !== undefined && /^\d+$/.test(palette)) return [7, 10, 11, 14, 15].includes(Number(palette)) ? 'light' : 'dark';
  const match = response.match(/\x1b\]11;rgb:([a-f\d]+)\/([a-f\d]+)\/([a-f\d]+)(?:\x07|\x1b\\)/i);
  if (!match) return 'dark';
  const channels = match.slice(1).map(value => {
    const c = parseInt(value, 16) / (16 ** value.length - 1);
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722 > .5 ? 'light' : 'dark';
}
type Input = Readable & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => unknown };
type Output = Writable & { isTTY?: boolean };
export interface TerminalProbe { theme: TerminalTheme; themeKnown: boolean; images: boolean }
/** True when COLORFGBG or an OSC 11 answer actually reported the background. */
export function themeReported(colorfgbg?: string, response = ''): boolean {
  const palette = colorfgbg?.split(';').at(-1);
  if (palette !== undefined && /^\d+$/.test(palette)) return true;
  return /\x1b\]11;rgb:[a-f\d]+\/[a-f\d]+\/[a-f\d]+(?:\x07|\x1b\\)/i.test(response);
}
/**
 * One bounded round trip before Ink starts: the background colour (unless
 * COLORFGBG already gives it) and, when the banner is wanted, the kitty graphics
 * query. Both are answered before DA1, which ends the wait; without DA1 the
 * wait ends at THEME_TIMEOUT_MS.
 */
export async function probeTerminal({ input = process.stdin, output = process.stdout, interactive, env = process.env, images = false }: {
  input?: Input; output?: Output; interactive: boolean; env?: NodeJS.ProcessEnv; images?: boolean;
}): Promise<TerminalProbe> {
  const colorfgbg = env['COLORFGBG'];
  if (!interactive || !input.isTTY || !output.isTTY || !input.setRawMode) return { theme: 'dark', themeKnown: false, images: false };
  if (colorfgbg && !images) return { theme: parseTerminalTheme(colorfgbg), themeKnown: themeReported(colorfgbg), images: false };
  const wasRaw = input.isRaw === true;
  const wasPaused = input.isPaused();
  input.setRawMode(true);
  let response = '';
  try {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); input.off('data', data); resolve(); };
      const data = (chunk: Buffer) => {
        response += chunk.toString();
        if (/\x1b\[[?\d;]*c/.test(response)) finish();
      };
      const timer = setTimeout(finish, THEME_TIMEOUT_MS);
      input.on('data', data);
      output.write((colorfgbg ? '' : '\x1b]11;?\x07') + (images ? KITTY_QUERY : '') + '\x1b[c');
    });
  } finally {
    input.setRawMode(wasRaw);
    if (wasPaused) input.pause();
  }
  return {
    theme: parseTerminalTheme(colorfgbg, response),
    themeKnown: themeReported(colorfgbg, response),
    images: images && answersImages(response),
  };
}
export async function detectTerminalTheme(options: {
  input?: Input; output?: Output; interactive: boolean; env?: NodeJS.ProcessEnv;
}): Promise<TerminalTheme> {
  return (await probeTerminal(options)).theme;
}
