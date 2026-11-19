// Regenerates src/lib/brand-images.ts from the three official terminal pieces.
// Usage: node scripts/embed-brand-images.mjs <directory with the PNG pieces>
//
// Each piece is embedded twice: the PNG itself (kitty graphics, f=100) and a
// compact indexed bitmap for sixel terminals, which take no PNG. The bitmap
// keeps up to three opaque colours plus transparency and is scaled to the
// terminal's cell size at run time.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const pieces = [
  ['darkIsotype', 'isotipo-terminal-oscuro.png'],
  ['lightIsotype', 'isotipo-terminal-claro.png'],
  ['icon', 'icono-terminal.png'],
];

/** RGBA pixels of a non-interlaced 8-bit RGB or RGBA PNG; anything else is refused. */
export function decodePng(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG file');
  let header;
  const data = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    if (type === 'IHDR') header = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colourType, , , interlace] = header.subarray(8, 13);
  const channels = { 2: 3, 6: 4 }[colourType];
  if (depth !== 8 || !channels || interlace !== 0) {
    throw new Error(`expected an 8-bit RGB or RGBA PNG without interlace, got depth ${depth}, colour type ${colourType}, interlace ${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const corner = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - corner;
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - corner)];
        value += a <= b && a <= c ? left : b <= c ? up : corner;
      }
      current[x] = value & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) rgba[(y * width + x) * 4 + channel] = current[x * channels + channel];
      rgba[(y * width + x) * 4 + 3] = channels === 4 ? current[x * channels + 3] : 255;
    }
    previous = current;
  }
  return { width, height, rgba };
}

/**
 * Up to three opaque colours (the most frequent fully opaque ones holding at
 * least 1% of the opaque pixels) and one index per pixel: 0 is transparent
 * (alpha under half), 1..3 the nearest palette colour. Runs of one index are
 * packed one per byte, index in the top two bits and length - 1 in the rest.
 */
export function indexBitmap({ width, height, rgba }) {
  const counts = new Map();
  let opaque = 0;
  for (let at = 0; at < rgba.length; at += 4) {
    if (rgba[at + 3] !== 255) continue;
    opaque++;
    const key = rgba.readUIntBE(at, 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const palette = [...counts].filter(([, count]) => count * 100 >= opaque).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => key);
  const rgb = palette.map(key => [key >> 16, (key >> 8) & 255, key & 255]);
  const runs = [];
  let index = -1;
  let length = 0;
  const flush = () => { if (length > 0) runs.push((index << 6) | (length - 1)); };
  for (let at = 0; at < rgba.length; at += 4) {
    let next = 0;
    if (rgba[at + 3] >= 128) {
      let best = Infinity;
      rgb.forEach(([r, g, b], slot) => {
        const distance = (rgba[at] - r) ** 2 + (rgba[at + 1] - g) ** 2 + (rgba[at + 2] - b) ** 2;
        if (distance < best) { best = distance; next = slot + 1; }
      });
    }
    if (next === index && length < 64) { length++; continue; }
    flush();
    index = next;
    length = 1;
  }
  flush();
  return { width, height, palette: palette.map(key => key.toString(16).padStart(6, '0')), runs: Buffer.from(runs).toString('base64') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: node scripts/embed-brand-images.mjs <directory with isotipo-terminal-oscuro.png, isotipo-terminal-claro.png and icono-terminal.png>');
    process.exit(1);
  }
  const lines = [
    '// Generated by scripts/embed-brand-images.mjs from the official terminal pieces; do not edit by hand.',
    '// Base64 PNG payloads for the kitty graphics protocol (f=100). sha256 of each source file is noted.',
    '// Each *Bitmap is the same piece indexed for sixel: palette colours 1..3, 0 transparent, run-length packed.',
    "import type { IndexedBitmap } from './sixel.js';",
  ];
  for (const [name, file] of pieces) {
    const bytes = readFileSync(join(directory, file));
    lines.push(`// ${file} sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
    lines.push(`export const ${name} = '${bytes.toString('base64')}';`);
    const bitmap = indexBitmap(decodePng(bytes));
    const palette = bitmap.palette.map(hex => `'${hex}'`).join(', ');
    lines.push(`export const ${name}Bitmap: IndexedBitmap = { width: ${bitmap.width}, height: ${bitmap.height}, palette: [${palette}], runs: '${bitmap.runs}' };`);
  }
  writeFileSync('src/lib/brand-images.ts', lines.join('\n') + '\n');
  console.log(`Wrote src/lib/brand-images.ts with ${pieces.length} pieces`);
}
