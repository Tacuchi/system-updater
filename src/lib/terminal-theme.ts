import type { Readable, Writable } from 'node:stream';
import type { TerminalTheme } from '../theme.js';
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
export async function detectTerminalTheme({ input = process.stdin, output = process.stdout, interactive, env = process.env }: {
  input?: Input; output?: Output; interactive: boolean; env?: NodeJS.ProcessEnv;
}): Promise<TerminalTheme> {
  if (!interactive || !input.isTTY || !output.isTTY || !input.setRawMode) return 'dark';
  if (env['COLORFGBG']) return parseTerminalTheme(env['COLORFGBG']);
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
      output.write('\x1b]11;?\x07\x1b[c');
    });
  } finally {
    input.setRawMode(wasRaw);
    if (wasPaused) input.pause();
  }
  return parseTerminalTheme(undefined, response);
}
