/**
 * The brand mark in the header: which form a terminal gets, and the exact
 * bytes of each image technique.
 *
 * Every form fills the same 6 x 3 cells. Tiers, most specific first (pickTier):
 * - placeholders: the PNG is transmitted once as a virtual placement (U=1) and
 *   every frame draws it with ordinary text cells (U+10EEEE plus row and column
 *   diacritics, the image id as the foreground colour), so the image moves with
 *   the frame Ink writes. Only for terminals known to draw placeholders: Warp
 *   answers the kitty query but leaves those cells empty.
 * - cursor: any other terminal that answers the kitty query. The image is
 *   placed at the header cell after every frame with a fixed image id and a
 *   fixed placement id, so placing again moves it instead of adding a copy.
 * - sixel: terminals whose DA1 reply lists sixel; drawn again after every frame.
 * - blocks: the mark as three lines of half-block text (brand-mark.ts), for
 *   every terminal where no image is chosen, the classic Windows console too.
 * - ascii: the same mark in plain ASCII, only when TACUCHI_ASCII=1 asks for it.
 * - none: the one-line header.
 * Ink clears the whole screen when a frame reaches the terminal height, and a
 * screen clear deletes kitty images, so both kitty tiers transmit again then.
 */
import type { TerminalTheme } from '../theme.js';
import { darkIsotype, darkIsotypeBitmap, icon, iconBitmap, lightIsotype, lightIsotypeBitmap } from './brand-images.js';
import type { CellSize, IndexedBitmap } from './sixel.js';

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

/** Asks the cell size in pixels; the answer is CSI 6 ; height ; width t. */
export const CELL_SIZE_QUERY = `${ESC}[16t`;
/** Fixed ids of the cursor tier: a run that crashed leaves an image a new run replaces. */
export const CURSOR_IMAGE_ID = 31_313;
export const CURSOR_PLACEMENT_ID = 1;
/** The image's first column inside a frame: the screen's padding plus the banner's margin. */
export const IMAGE_COLUMN = 2;
/** Sixel is opt-in until it has been seen in a real terminal; flipping this turns it on. */
export const SIXEL_BY_DEFAULT = false;
/** Cells every form of the mark fills: Muesca's 6 x 6 grid, one half-block per grid cell. */
export const MARK_COLUMNS = 6;
export const MARK_ROWS = 3;

export type ImageTier = 'placeholders' | 'cursor' | 'sixel';
export type TextTier = 'blocks' | 'ascii';
export type BannerTier = ImageTier | TextTier | 'none';

export interface BannerPiece {
  name: 'isotipo-terminal-oscuro' | 'isotipo-terminal-claro' | 'icono-terminal';
  png: string;
  bitmap: IndexedBitmap;
  columns: number;
  rows: number;
}

/** Support means an OK answer to the query that arrives before the DA1 reply. */
export function answersImages(response: string): boolean {
  const answer = response.indexOf(`${ESC}_Gi=${KITTY_QUERY_ID};OK${ST}`);
  const attributes = response.search(/\x1b\[[?\d;]*c/);
  return answer !== -1 && attributes !== -1 && answer < attributes;
}

/** True when the DA1 reply lists attribute 4 (sixel graphics). */
export function listsSixel(response: string): boolean {
  const match = response.match(/\x1b\[\?([\d;]*)c/);
  return match !== null && match[1]!.split(';').includes('4');
}

/** The cell size from a CSI 16 t answer that arrives before DA1, or null. */
export function cellSize(response: string): CellSize | null {
  const match = response.match(/\x1b\[6;(\d+);(\d+)t/);
  const attributes = response.search(/\x1b\[[?\d;]*c/);
  if (!match || attributes === -1 || match.index! > attributes) return null;
  const [height, width] = [Number(match[1]), Number(match[2])];
  return height > 0 && width > 0 ? { width, height } : null;
}

/** Terminals known to draw Unicode placeholders. */
export function drawsPlaceholders(env: NodeJS.ProcessEnv): boolean {
  return env['TERM_PROGRAM'] === 'ghostty' || env['TERM'] === 'xterm-ghostty' || env['TERM'] === 'xterm-kitty' || env['KITTY_WINDOW_ID'] !== undefined;
}

/** TACUCHI_BANNER=off|placeholders|cursor|sixel|blocks|ascii forces a tier; any other value is ignored. */
export function forcedTier(env: NodeJS.ProcessEnv): BannerTier | null {
  const value = env['TACUCHI_BANNER']?.trim().toLowerCase();
  if (value === 'off') return 'none';
  return value === 'placeholders' || value === 'cursor' || value === 'sixel' || value === 'blocks' || value === 'ascii' ? value : null;
}

const isTextTier = (tier: BannerTier | null): tier is TextTier => tier === 'blocks' || tier === 'ascii';

/**
 * The text form where no image is drawn: the ASCII art only when TACUCHI_ASCII=1
 * asks for it. The ASCII glyph set that TERM=dumb or the classic Windows
 * console turn on keeps the blocks: CP437 has them.
 */
export function textTier(env: NodeJS.ProcessEnv): TextTier {
  return env['TACUCHI_ASCII'] === '1' ? 'ascii' : 'blocks';
}

export type ImageBlocker = 'not-interactive' | 'no-color' | 'ascii' | 'multiplexer';

/**
 * Why no image can be drawn, so the mark is text, or null when an image may be
 * tried. Without an interactive stdin the terminal cannot be asked; without
 * colour the image would bring its own; the ASCII glyph set means a console
 * that would print the query; a multiplexer keeps graphics from the terminal.
 */
export function imageBlocker({ env, interactive, ascii }: { env: NodeJS.ProcessEnv; interactive: boolean; ascii: boolean }): ImageBlocker | null {
  if (!interactive) return 'not-interactive';
  if (env['NO_COLOR'] !== undefined) return 'no-color';
  if (ascii) return 'ascii';
  if (env['TMUX'] || env['STY'] || /^(?:screen|tmux)/.test(env['TERM'] ?? '')) return 'multiplexer';
  return null;
}

/**
 * The tier for this terminal, from its identity and its answers. The
 * line-header conditions (bannerBlocker) are checked by the caller and win
 * over everything, a forced tier included; where images are ruled out
 * (textOnly), a forced image tier becomes the text form.
 */
export function pickTier({ env, images, sixel, textOnly }: { env: NodeJS.ProcessEnv; images: boolean; sixel: boolean; textOnly: boolean }): BannerTier {
  const forced = forcedTier(env);
  if (forced === 'none' || isTextTier(forced)) return forced;
  if (textOnly) return textTier(env);
  if (forced) return forced;
  if (images) return drawsPlaceholders(env) ? 'placeholders' : 'cursor';
  if (SIXEL_BY_DEFAULT && sixel) return 'sixel';
  return textTier(env);
}

export function pickPiece(theme: TerminalTheme, themeKnown: boolean): BannerPiece {
  const size = { columns: MARK_COLUMNS, rows: MARK_ROWS };
  if (!themeKnown) return { name: 'icono-terminal', png: icon, bitmap: iconBitmap, ...size };
  return theme === 'light'
    ? { name: 'isotipo-terminal-claro', png: lightIsotype, bitmap: lightIsotypeBitmap, ...size }
    : { name: 'isotipo-terminal-oscuro', png: darkIsotype, bitmap: darkIsotypeBitmap, ...size };
}

export type BannerBlocker = 'not-tty' | 'narrow' | 'short';

/** Why the line header must be used instead of the mark, or null when the mark fits. */
export function bannerBlocker({ stdoutTTY, columns, rows }: { stdoutTTY: boolean; columns: number; rows: number }): BannerBlocker | null {
  if (!stdoutTTY) return 'not-tty';
  if (columns < BANNER_MIN_COLUMNS) return 'narrow';
  if (rows < BANNER_MIN_ROWS) return 'short';
  return null;
}

/** Whether the header gets the mark in any form: not turned off and no line-header condition. */
export function bannerWanted({ env, stdoutTTY, columns, rows }: {
  env: NodeJS.ProcessEnv; stdoutTTY: boolean; columns: number; rows: number;
}): boolean {
  return forcedTier(env) !== 'none' && bannerBlocker({ stdoutTTY, columns, rows }) === null;
}

interface RunShape { env: NodeJS.ProcessEnv; interactive: boolean; ascii: boolean; stdoutTTY: boolean; columns: number; rows: number }

/** Whether to send the image query: the mark is wanted, an image could be drawn and no text form is forced. */
export function imagesWanted(run: RunShape): boolean {
  return bannerWanted(run) && imageBlocker(run) === null && !isTextTier(forcedTier(run.env));
}

/** The whole choice, after the terminal answered (or was not asked): 'none' is the line header. */
export function resolveTier(run: RunShape & { images: boolean; sixel: boolean }): BannerTier {
  if (!bannerWanted(run)) return 'none';
  return pickTier({ env: run.env, images: run.images, sixel: run.sixel, textOnly: imageBlocker(run) !== null });
}

/** The cell size matters only to sixel, so it is asked only when sixel can be chosen. */
export function sixelPossible(env: NodeJS.ProcessEnv): boolean {
  return SIXEL_BY_DEFAULT || forcedTier(env) === 'sixel';
}

/** An image id in 16..255, written as a 256-colour index by the placeholders. */
export function pickImageId(random = Math.random): number {
  return 16 + Math.floor(random() * 240);
}

function chunked(png: string, firstKeys: string): string {
  const chunks: string[] = [];
  for (let start = 0; start < png.length; start += CHUNK) chunks.push(png.slice(start, start + CHUNK));
  return chunks.map((chunk, index) => {
    const more = index < chunks.length - 1 ? 1 : 0;
    return `${ESC}_G${index === 0 ? `${firstKeys},m=${more}` : `m=${more}`};${chunk}${ST}`;
  }).join('');
}

/** Placeholder tier: transmit and create the virtual placement the placeholder cells point to. */
export function transmitImage(id: number, piece: Pick<BannerPiece, 'png' | 'columns' | 'rows'>): string {
  return chunked(piece.png, `a=T,U=1,f=100,t=d,i=${id},c=${piece.columns},r=${piece.rows},C=1,q=2`);
}

/** Cursor tier: transmit the data only; placeImage shows it. */
export function transmitData(id: number, png: string): string {
  return chunked(png, `a=t,f=100,t=d,i=${id},q=2`);
}

/**
 * Cursor tier: place the image `up` rows above the cursor at IMAGE_COLUMN,
 * scaled into columns × rows cells, without moving the cursor (C=1, plus a
 * saved and restored cursor for the moves). Placing the same image and
 * placement id again moves the placement.
 */
export function placeImage({ id, placement, columns, rows, up }: { id: number; placement: number; columns: number; rows: number; up: number }): string {
  return `${ESC}7${up > 0 ? `${ESC}[${up}A` : ''}${ESC}[${IMAGE_COLUMN + 1}G${ESC}_Ga=p,i=${id},p=${placement},c=${columns},r=${rows},C=1,q=2${ST}${ESC}8`;
}

/** Removes one placement and keeps the image data, so it can be placed again. */
export function deletePlacement(id: number, placement: number): string {
  return `${ESC}_Ga=d,d=i,i=${id},p=${placement},q=2${ST}`;
}

/** Sixel tier: draw the image `up` rows above the cursor at IMAGE_COLUMN, cursor saved and restored. */
export function drawSixel(sixel: string, up: number): string {
  return `${ESC}7${up > 0 ? `${ESC}[${up}A` : ''}${ESC}[${IMAGE_COLUMN + 1}G${sixel}${ESC}8`;
}

export function deleteImage(id: number): string {
  return `${ESC}_Ga=d,d=I,i=${id},q=2${ST}`;
}

export function placeholderRows(id: number, columns: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, row) =>
    `${ESC}[38;5;${id}m${Array.from({ length: columns }, (_, column) => PLACEHOLDER + DIACRITICS[row] + DIACRITICS[column]).join('')}${ESC}[39m`);
}
