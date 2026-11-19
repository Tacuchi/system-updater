import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import { LIME_CELLS, MARK_ART, markSegments } from './brand-mark.js';
import { MARK_COLUMNS, MARK_ROWS } from './terminal-image.js';

describe('the mark as text', () => {
  it('is cell for cell the official half-block piece', () => {
    expect(MARK_ART.blocks).toEqual(['██████', '███▀▀▀', '███ ▄█']);
  });
  it('is cell for cell the official ASCII piece', () => {
    expect(MARK_ART.ascii).toEqual(['######', '###"""', '### _#']);
  });
  it('keeps the 6 x 3 footprint of the images in both forms', () => {
    for (const rows of Object.values(MARK_ART)) {
      expect(rows).toHaveLength(MARK_ROWS);
      for (const row of rows) expect(stringWidth(row)).toBe(MARK_COLUMNS);
    }
  });
  it('uses only glyphs the classic Windows console has (CP437) in the blocks form, and plain ASCII in the other', () => {
    expect(MARK_ART.blocks.join('')).toMatch(/^[█▀▄ ]+$/);
    expect(MARK_ART.ascii.join('')).toMatch(/^[\x20-\x7e]+$/);
  });
  it('marks as lime only the last two cells of the bottom row', () => {
    expect(LIME_CELLS).toBe(2);
    expect(markSegments('blocks')).toEqual([
      [{ text: '██████', lime: false }],
      [{ text: '███▀▀▀', lime: false }],
      [{ text: '███ ', lime: false }, { text: '▄█', lime: true }],
    ]);
    expect(markSegments('ascii')[2]).toEqual([{ text: '### ', lime: false }, { text: '_#', lime: true }]);
  });
});
