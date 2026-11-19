/**
 * The brand image for sixel terminals (Windows Terminal 1.22+, among others).
 *
 * Sixel takes no PNG and is sized in device pixels, so the piece travels as a
 * compact indexed bitmap (scripts/embed-brand-images.mjs) and is scaled here to
 * the cell size the terminal reports. Index 0 is transparent: the sixel
 * parameter P2=1 leaves those pixels untouched, so the terminal background
 * shows through.
 */
const ESC = '\x1b';

export interface IndexedBitmap {
  width: number;
  height: number;
  /** Opaque colours as rrggbb; pixel index n means palette[n - 1]. */
  palette: string[];
  /** Base64 runs: one byte each, index in the top two bits, run length - 1 in the low six. */
  runs: string;
}

export interface CellSize { width: number; height: number }
/** Assumed when the terminal does not answer CSI 16 t before DA1. */
export const DEFAULT_CELL: CellSize = { width: 10, height: 20 };

export function decodeRuns(bitmap: IndexedBitmap): Uint8Array {
  const pixels = new Uint8Array(bitmap.width * bitmap.height);
  let at = 0;
  for (const byte of Buffer.from(bitmap.runs, 'base64')) {
    const end = Math.min(pixels.length, at + (byte & 63) + 1);
    pixels.fill(byte >> 6, at, end);
    at = end;
  }
  if (at !== pixels.length) throw new Error(`bitmap runs cover ${at} pixels, expected ${pixels.length}`);
  return pixels;
}

/**
 * Box-filter scale: each target pixel looks at the source pixels it covers and
 * is transparent when most of them are, else the most frequent opaque index.
 */
export function scaleIndexed(source: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): Uint8Array {
  const target = new Uint8Array(targetWidth * targetHeight);
  const counts = [0, 0, 0, 0];
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor(ty * height / targetHeight);
    const y1 = Math.max(y0 + 1, Math.floor((ty + 1) * height / targetHeight));
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor(tx * width / targetWidth);
      const x1 = Math.max(x0 + 1, Math.floor((tx + 1) * width / targetWidth));
      counts.fill(0);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) counts[source[y * width + x]!]!++;
      let best = 0;
      if (counts[0]! * 2 <= (y1 - y0) * (x1 - x0)) {
        for (let index = 1; index < 4; index++) if (best === 0 || counts[index]! > counts[best]!) best = index;
      }
      target[ty * targetWidth + tx] = best;
    }
  }
  return target;
}

const percent = (channel: number) => Math.round(channel * 100 / 255);
const repeat = (char: string, count: number) => count >= 4 ? `!${count}${char}` : char.repeat(count);

/**
 * A sixel image with a transparent background (P2=1) and square pixels
 * ("1;1 raster attributes). Each band of six rows paints one colour at a time,
 * returning to the band start with `$`; trailing empty sixels are omitted.
 */
export function encodeSixel(pixels: Uint8Array, width: number, height: number, palette: string[]): string {
  let out = `${ESC}P0;1;0q"1;1;${width};${height}`;
  palette.forEach((hex, slot) => {
    const value = parseInt(hex, 16);
    out += `#${slot + 1};2;${percent(value >> 16)};${percent((value >> 8) & 255)};${percent(value & 255)}`;
  });
  for (let band = 0; band < height; band += 6) {
    const layers: string[] = [];
    for (let index = 1; index <= palette.length; index++) {
      const runs: Array<[string, number]> = [];
      for (let x = 0; x < width; x++) {
        let bits = 0;
        for (let row = 0; row < 6 && band + row < height; row++) if (pixels[(band + row) * width + x] === index) bits |= 1 << row;
        const char = String.fromCharCode(63 + bits);
        const last = runs.at(-1);
        if (last && last[0] === char) last[1]++;
        else runs.push([char, 1]);
      }
      if (runs.at(-1)?.[0] === '?') runs.pop();
      if (runs.length > 0) layers.push(`#${index}${runs.map(([char, count]) => repeat(char, count)).join('')}`);
    }
    out += layers.join('$') + (band + 6 < height ? '-' : '');
  }
  return `${out}${ESC}\\`;
}

/** The piece as sixel, columns × rows cells of the given pixel size. */
export function sixelImage(bitmap: IndexedBitmap, columns: number, rows: number, cell: CellSize = DEFAULT_CELL): string {
  const width = columns * cell.width;
  const height = rows * cell.height;
  return encodeSixel(scaleIndexed(decodeRuns(bitmap), bitmap.width, bitmap.height, width, height), width, height, bitmap.palette);
}
