/**
 * The brand image in the header, through the kitty graphics protocol.
 *
 * Placement uses Unicode placeholders: the PNG is transmitted once as a virtual
 * placement (U=1) and every frame draws it with ordinary text cells
 * (U+10EEEE plus row and column diacritics, the image id as the foreground
 * colour). Ink erases and rewrites lines on every frame; the protocol says text
 * erasing must not touch images placed at the cursor, so a cursor placement
 * would stay behind as a ghost. Placeholders are text, so the image moves,
 * disappears and reappears exactly with the frame Ink writes.
 */
import type { TerminalTheme } from '../theme.js';
import { darkIsotype, icon, lightIsotype } from './brand-images.js';

const ESC = '\x1b';
const ST = `${ESC}\\`;
export const KITTY_QUERY_ID = 31;
/** A one-pixel RGB query: the terminal answers OK or an error and keeps nothing. */
export const KITTY_QUERY = `${ESC}_Gi=${KITTY_QUERY_ID},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`;
export const BANNER_MIN_COLUMNS = 60;
/** The bounded screens need 17 rows; the banner takes two more than the line header. */
export const BANNER_MIN_ROWS = 17 + 2;
/** Rows the banner adds over the one-line header. */
export const BANNER_EXTRA_ROWS = 2;
const CHUNK = 4096;
const PLACEHOLDER = '\u{10EEEE}';
// First entries of the protocol's row/column diacritics table (rowcolumn-diacritics.txt).
const DIACRITICS = [0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f].map(code => String.fromCodePoint(code));

export interface BannerPiece {
  name: 'isotipo-terminal-oscuro' | 'isotipo-terminal-claro' | 'icono-terminal';
  png: string;
  columns: number;
  rows: number;
}

/** Support means an OK answer to the query that arrives before the DA1 reply. */
export function answersImages(response: string): boolean {
  const answer = response.indexOf(`${ESC}_Gi=${KITTY_QUERY_ID};OK${ST}`);
  const attributes = response.search(/\x1b\[[?\d;]*c/);
  return answer !== -1 && attributes !== -1 && answer < attributes;
}

export function pickPiece(theme: TerminalTheme, themeKnown: boolean): BannerPiece {
  if (!themeKnown) return { name: 'icono-terminal', png: icon, columns: 6, rows: 3 };
  return theme === 'light'
    ? { name: 'isotipo-terminal-claro', png: lightIsotype, columns: 8, rows: 3 }
    : { name: 'isotipo-terminal-oscuro', png: darkIsotype, columns: 8, rows: 3 };
}

export type BannerBlocker = 'not-tty' | 'no-color' | 'ascii' | 'multiplexer' | 'narrow' | 'short';

/** Why the line header must be used instead of the banner, or null when the banner fits. */
export function bannerBlocker({ env, stdoutTTY, ascii, columns, rows }: {
  env: NodeJS.ProcessEnv; stdoutTTY: boolean; ascii: boolean; columns: number; rows: number;
}): BannerBlocker | null {
  if (!stdoutTTY) return 'not-tty';
  if (env['NO_COLOR'] !== undefined) return 'no-color';
  if (ascii) return 'ascii';
  if (env['TMUX'] || env['STY'] || /^(?:screen|tmux)/.test(env['TERM'] ?? '')) return 'multiplexer';
  if (columns < BANNER_MIN_COLUMNS) return 'narrow';
  if (rows < BANNER_MIN_ROWS) return 'short';
  return null;
}

/** An image id in 16..255, written as a 256-colour index by the placeholders. */
export function pickImageId(random = Math.random): number {
  return 16 + Math.floor(random() * 240);
}

export function transmitImage(id: number, piece: Pick<BannerPiece, 'png' | 'columns' | 'rows'>): string {
  const chunks: string[] = [];
  for (let start = 0; start < piece.png.length; start += CHUNK) chunks.push(piece.png.slice(start, start + CHUNK));
  return chunks.map((chunk, index) => {
    const more = index < chunks.length - 1 ? 1 : 0;
    const keys = index === 0 ? `a=T,U=1,f=100,t=d,i=${id},c=${piece.columns},r=${piece.rows},C=1,q=2,m=${more}` : `m=${more}`;
    return `${ESC}_G${keys};${chunk}${ST}`;
  }).join('');
}

export function deleteImage(id: number): string {
  return `${ESC}_Ga=d,d=I,i=${id},q=2${ST}`;
}

export function placeholderRows(id: number, columns: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, row) =>
    `${ESC}[38;5;${id}m${Array.from({ length: columns }, (_, column) => PLACEHOLDER + DIACRITICS[row] + DIACRITICS[column]).join('')}${ESC}[39m`);
}
