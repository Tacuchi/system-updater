import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
// @ts-expect-error plain JavaScript script, no declarations
import { decodePng, indexBitmap } from './embed-brand-images.mjs';
import { darkIsotype, darkIsotypeBitmap, icon, iconBitmap, lightIsotype, lightIsotypeBitmap } from '../src/lib/brand-images.js';

function png(width: number, height: number, rows: number[][]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.concat(rows.map(row => Buffer.from([0, ...row])));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

describe('brand image embedding', () => {
  it('indexes a PNG: frequent opaque colours, nearest colour for edges, transparent under half alpha', () => {
    const red = [255, 0, 0, 255], blue = [0, 0, 255, 255], clear = [0, 0, 0, 0];
    const edge = [250, 10, 10, 200], faint = [0, 0, 255, 100];
    const bitmap = indexBitmap(decodePng(png(3, 2, [[...red, ...red, ...blue], [...edge, ...faint, ...clear]])));
    expect(bitmap.palette).toEqual(['ff0000', '0000ff']);
    const bytes = [...Buffer.from(bitmap.runs, 'base64')];
    expect(bytes).toEqual([(1 << 6) | 1, (2 << 6) | 0, (1 << 6) | 0, (0 << 6) | 1]);
  });
  it('refuses a PNG it cannot read instead of guessing', () => {
    const bytes = png(1, 1, [[0, 0, 0, 0]]);
    bytes[8 + 8 + 8 + 1] = 3;
    expect(() => decodePng(bytes)).toThrow(/8-bit RGB or RGBA PNG/);
  });
  it('keeps the embedded bitmaps in step with the embedded PNG pieces', () => {
    for (const [source, bitmap] of [[darkIsotype, darkIsotypeBitmap], [lightIsotype, lightIsotypeBitmap], [icon, iconBitmap]] as const) {
      expect(indexBitmap(decodePng(Buffer.from(source, 'base64')))).toEqual(bitmap);
    }
  });
});
