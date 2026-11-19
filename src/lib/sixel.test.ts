import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL, decodeRuns, encodeSixel, scaleIndexed, sixelImage, type IndexedBitmap } from './sixel.js';
import { darkIsotypeBitmap, iconBitmap, lightIsotypeBitmap } from './brand-images.js';

const runs = (...pairs: Array<[index: number, length: number]>) => Buffer.from(pairs.map(([index, length]) => (index << 6) | (length - 1))).toString('base64');

describe('indexed bitmap', () => {
  it('unpacks runs of one index, up to 64 pixels each', () => {
    const bitmap: IndexedBitmap = { width: 4, height: 20, palette: ['ff0000'], runs: runs([0, 3], [1, 64], [2, 13]) };
    const pixels = decodeRuns(bitmap);
    expect(Array.from(pixels.subarray(0, 4))).toEqual([0, 0, 0, 1]);
    expect(pixels.filter(index => index === 1).length).toBe(64);
    expect(Array.from(pixels.subarray(67))).toEqual(new Array(13).fill(2));
  });
  it('refuses runs that do not cover the bitmap exactly', () => {
    expect(() => decodeRuns({ width: 2, height: 2, palette: [], runs: runs([0, 3]) })).toThrow('bitmap runs cover 3 pixels, expected 4');
  });
  it('decodes every embedded piece to its full size with at most three colours', () => {
    for (const [bitmap, width, height, colours] of [[darkIsotypeBitmap, 368, 312, 2], [lightIsotypeBitmap, 368, 312, 2], [iconBitmap, 192, 192, 3]] as const) {
      expect([bitmap.width, bitmap.height, bitmap.palette.length]).toEqual([width, height, colours]);
      const used = new Set(decodeRuns(bitmap));
      expect([...used].sort()).toEqual(Array.from({ length: colours + 1 }, (_, index) => index));
    }
  });
});

describe('scaling', () => {
  it('keeps the majority of each box and turns a mostly transparent box transparent', () => {
    const source = Uint8Array.from([
      1, 1, 0, 0,
      1, 2, 0, 3,
      2, 2, 3, 3,
      2, 0, 3, 0,
    ]);
    expect(Array.from(scaleIndexed(source, 4, 4, 2, 2))).toEqual([1, 0, 2, 3]);
  });
  it('repeats pixels when scaling up', () => {
    expect(Array.from(scaleIndexed(Uint8Array.from([1, 2]), 2, 1, 4, 2))).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });
});

describe('sixel encoder', () => {
  it('encodes a tiny bitmap exactly: palette, bands of six rows, one colour per pass', () => {
    // 3 × 7: colour 1 at (0,0) (0,1) (1,6); colour 2 at (2,0).
    const pixels = new Uint8Array(21);
    pixels[0] = 1; pixels[3] = 1; pixels[2] = 2; pixels[6 * 3 + 1] = 1;
    expect(encodeSixel(pixels, 3, 7, ['ff0000', '00ff00'])).toBe(
      '\x1bP0;1;0q"1;1;3;7#1;2;100;0;0#2;2;0;100;0' + '#1B$#2??@' + '-' + '#1?@' + '\x1b\\',
    );
  });
  it('compresses runs of four or more and skips a colour absent from a band', () => {
    const pixels = new Uint8Array(6).fill(1);
    expect(encodeSixel(pixels, 6, 1, ['ffffff', '000000'])).toBe('\x1bP0;1;0q"1;1;6;1#1;2;100;100;100#2;2;0;0;0#1!6@\x1b\\');
  });
  it('sizes the piece by the cell size, with a default when the terminal does not say', () => {
    expect(DEFAULT_CELL).toEqual({ width: 10, height: 20 });
    const image = sixelImage(darkIsotypeBitmap, 8, 3);
    expect(image.startsWith('\x1bP0;1;0q"1;1;80;60#1;2;90;90;89#2;2;71;95;24')).toBe(true);
    expect(image.endsWith('\x1b\\')).toBe(true);
    expect(image.slice(2, -2)).toMatch(/^[\x20-\x7e]+$/);
    expect(image.split('-').length).toBe(10);
    expect(sixelImage(iconBitmap, 6, 3, { width: 9, height: 19 })).toContain('"1;1;54;57');
  });
});
