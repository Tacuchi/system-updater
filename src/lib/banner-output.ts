/**
 * What the banner writes besides Ink's frames, and when.
 *
 * Ink owns stdout; wrapStdout hands it a stream that forwards every write
 * untouched and then appends what the banner needs after that write. The
 * appended bytes go to the real stdout only, and only when the banner was set
 * up, which needs a TTY: redirected line output never sees an image byte.
 *
 * Where the header is comes from the bytes Ink wrote, not from guessing
 * heights: Ink writes each frame in one write that ends at the frame's end, its
 * header on the frame's first line, so the newlines after the last screen
 * clear are the rows from the cursor back up to the header.
 */
import {
  CURSOR_IMAGE_ID, CURSOR_PLACEMENT_ID, deleteImage, deletePlacement, drawSixel, pickImageId, placeImage,
  transmitData, transmitImage, type BannerPiece, type ImageTier,
} from './terminal-image.js';
import { sixelImage, type CellSize } from './sixel.js';
import { configureBanner, shownBanner, type BannerImage } from './banner.js';

const CLEAR = /\x1b\[[23]J/g;

/** Rows from the cursor up to the frame's first line, or null when the write is not a frame. */
export function frameRows(chunk: string): number | null {
  let start = 0;
  for (const match of chunk.matchAll(CLEAR)) start = match.index + match[0].length;
  const cleared = start > 0;
  const rows = chunk.slice(start).split('\n').length - 1;
  return rows > 0 || cleared ? rows : null;
}

export function clearsScreen(chunk: string): boolean {
  return /\x1b\[[23]J/.test(chunk);
}

export interface PainterOptions {
  tier: ImageTier;
  id: number;
  columns: number;
  rows: number;
  /** What brings a kitty image back after a screen clear deleted it. */
  retransmit: string;
  /** Sixel tier: the image, already scaled and encoded. */
  sixel?: string;
  /** Whether the header just written is the banner (not the one-line fallback). */
  shown: () => boolean;
  terminalRows: () => number;
}

/** The bytes to append after one write of Ink's, per tier. */
export function bannerPainter({ tier, id, columns, rows, retransmit, sixel = '', shown, terminalRows }: PainterOptions): (chunk: string) => string {
  let placed = false;
  return chunk => {
    const cleared = clearsScreen(chunk);
    let extra = '';
    if (cleared && tier !== 'sixel') { extra += retransmit; placed = false; }
    if (tier === 'placeholders') return extra;
    const up = frameRows(chunk);
    if (up === null) return extra;
    // A frame taller than the terminal has its header scrolled away.
    const visible = shown() && up <= terminalRows() - 1;
    if (tier === 'sixel') return visible ? extra + drawSixel(sixel, up) : extra;
    if (visible) {
      placed = true;
      return extra + placeImage({ id, placement: CURSOR_PLACEMENT_ID, columns, rows, up });
    }
    if (placed) { placed = false; return extra + deletePlacement(id, CURSOR_PLACEMENT_ID); }
    return extra;
  };
}

export interface StartedBanner {
  image: BannerImage;
  /** Written once before Ink starts. */
  start: string;
  /** Appended after each write of Ink's. */
  after: (chunk: string) => string;
  /** Written on every exit path. */
  exit: string;
}

/** Everything one run of the banner needs, for the given tier and piece. */
export function startBanner({ tier, piece, cell, shown, terminalRows, random }: {
  tier: ImageTier; piece: BannerPiece; cell: CellSize | null; shown: () => boolean; terminalRows: () => number; random?: () => number;
}): StartedBanner {
  const { columns, rows } = piece;
  if (tier === 'sixel') {
    const sixel = sixelImage(piece.bitmap, columns, rows, cell ?? undefined);
    return { image: { id: 0, columns, rows, tier }, start: '', exit: '', after: bannerPainter({ tier, id: 0, columns, rows, retransmit: '', sixel, shown, terminalRows }) };
  }
  const id = tier === 'cursor' ? CURSOR_IMAGE_ID : pickImageId(random);
  const transmit = tier === 'cursor' ? transmitData(id, piece.png) : transmitImage(id, piece);
  return {
    image: { id, columns, rows, tier },
    start: transmit,
    exit: deleteImage(id),
    after: bannerPainter({ tier, id, columns, rows, retransmit: transmit, shown, terminalRows }),
  };
}

type Output = NodeJS.WriteStream;

/** stdout for Ink: every write goes through unchanged, then `after` of it, if anything. */
export function wrapStdout(stdout: Output, after: (chunk: string) => string): Output {
  const write = (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    const result = (stdout.write as (...args: unknown[]) => boolean)(chunk, ...rest);
    const extra = after(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
    if (extra) stdout.write(extra);
    return result;
  };
  return new Proxy(stdout, {
    get(target, property) {
      if (property === 'write') return write;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/**
 * Starts the banner on a TTY stdout: sends the image, configures the header and
 * returns the stream Ink must write to. With `exitEvents`, the image is deleted
 * on its 'exit' event, which every route out of the process reaches.
 */
export function mountBanner({ tier, piece, cell, stdout, exitEvents, random }: {
  tier: ImageTier; piece: BannerPiece; cell: CellSize | null; stdout: Output;
  exitEvents?: Pick<NodeJS.EventEmitter, 'on'>; random?: () => number;
}): { stdout: Output; banner: StartedBanner } {
  const banner = startBanner({ tier, piece, cell, random, shown: () => shownBanner() !== null, terminalRows: () => stdout.rows ?? 24 });
  if (banner.start) stdout.write(banner.start);
  configureBanner(banner.image);
  if (exitEvents && banner.exit) exitEvents.on('exit', () => { stdout.write(banner.exit); });
  return { stdout: wrapStdout(stdout, banner.after), banner };
}
