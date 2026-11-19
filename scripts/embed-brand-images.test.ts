import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
  it('embeds exactly the source files it notes: the sha256 of each payload matches its comment', () => {
    const source = readFileSync(new URL('../src/lib/brand-images.ts', import.meta.url), 'utf8');
    const noted = [...source.matchAll(/^\/\/ (\S+\.png) sha256 ([0-9a-f]{64})$/gm)].map(match => [match[1], match[2]]);
    expect(noted.map(([file]) => file)).toEqual(['isotipo-terminal-oscuro.png', 'isotipo-terminal-claro.png', 'icono-terminal.png']);
    const payloads = [darkIsotype, lightIsotype, icon].map(png => createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
    expect(payloads).toEqual(noted.map(([, hash]) => hash));
  });
  it('embeds the Muesca pieces: square, and the dark and light isotypes differ only in the block colour', () => {
    expect([darkIsotypeBitmap, lightIsotypeBitmap, iconBitmap].map(bitmap => [bitmap.width, bitmap.height])).toEqual([[312, 312], [312, 312], [192, 192]]);
    expect(darkIsotypeBitmap.palette).toEqual(['e6e6e2', 'b6f23c']);
    expect(lightIsotypeBitmap.palette).toEqual(['111111', 'b6f23c']);
    expect(lightIsotypeBitmap.runs).toBe(darkIsotypeBitmap.runs);
  });
});
