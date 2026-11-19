/**
 * The isotype as text, cell for cell the official terminal pieces bloques.txt
 * and ascii.txt. Muesca is drawn on a 6 x 6 grid, so at 3 rows each grid cell
 * is exactly one half-block and the shape survives without an image.
 *
 * The last two cells of the bottom row are the lime piece fitted in the
 * notch; everything else is the block.
 */
import type { TextTier } from './terminal-image.js';

export const MARK_ART: Record<TextTier, readonly string[]> = {
  blocks: ['██████', '███▀▀▀', '███ ▄█'],
  ascii: ['######', '###"""', '### _#'],
};

/** Cells of the lime piece, at the end of the bottom row. */
export const LIME_CELLS = 2;

export interface MarkSegment { text: string; lime: boolean }

/** Each row of the mark split into block and lime runs, for a renderer to colour. */
export function markSegments(form: TextTier): MarkSegment[][] {
  const rows = MARK_ART[form];
  return rows.map((row, index) => {
    if (index < rows.length - 1) return [{ text: row, lime: false }];
    const cut = row.length - LIME_CELLS;
    return [{ text: row.slice(0, cut), lime: false }, { text: row.slice(cut), lime: true }];
  });
}
