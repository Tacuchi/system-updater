import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import React from 'react';
// Ink reads CI once at import and, under CI, writes only the last frame; these
// tests are about the interactive redraw, so pin it like the banner probe does.
vi.hoisted(() => { process.env['CI'] = 'false'; process.env['CONTINUOUS_INTEGRATION'] = 'false'; });
import { Box, Text, render } from 'ink';
import { bannerPainter, clearsScreen, frameRows, mountBanner, startBanner, wrapStdout } from './banner-output.js';
import { bannerSnapshot, configureBanner } from './banner.js';
import { deleteImage, deletePlacement, drawSixel, pickPiece, placeImage, transmitData, transmitImage } from './terminal-image.js';
import { sixelImage } from './sixel.js';

const ERASE_3 = '\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[G';
const CLEAR = '\x1b[2J\x1b[3J\x1b[H';
const WINDOWS_CLEAR = '\x1b[2J\x1b[0f';
afterEach(() => configureBanner(null));

describe('frames in the bytes Ink writes', () => {
  it('counts the rows from the cursor up to the first line of the frame', () => {
    expect(frameRows(ERASE_3 + 'header\nbody\nhints\n')).toBe(3);
    expect(frameRows('header\n')).toBe(1);
    // After a clear Ink writes the frame without the last newline: the cursor stays on its last row.
    expect(frameRows(CLEAR + 'header\nbody\nhints')).toBe(2);
    expect(frameRows(WINDOWS_CLEAR + 'old\nheader\nbody')).toBe(2);
    expect(frameRows(CLEAR + 'header')).toBe(0);
  });
  it('ignores writes that are not frames', () => {
    for (const chunk of ['\x1b[?25l', '\x1b[?25h', '\x1b[?2026h', '\x1b[?2026l', ERASE_3, '']) expect(frameRows(chunk)).toBeNull();
  });
  it('sees a screen clear in either form Ink writes', () => {
    expect(clearsScreen(CLEAR + 'x')).toBe(true);
    expect(clearsScreen(WINDOWS_CLEAR + 'x')).toBe(true);
    expect(clearsScreen(ERASE_3 + 'x\n')).toBe(false);
  });
});

const geometry = { id: 31313, columns: 8, rows: 3, retransmit: 'RETRANSMIT' };
const place = (up: number) => placeImage({ id: 31313, placement: 1, columns: 8, rows: 3, up });

describe('cursor tier', () => {
  it('places after every frame and moves the same placement when the height changes', () => {
    const after = bannerPainter({ tier: 'cursor', ...geometry, shown: () => true, terminalRows: () => 30 });
    expect(after('\x1b[?25l')).toBe('');
    expect(after('a\nb\nc\n')).toBe(place(3));
    expect(after(ERASE_3 + 'a\nb\nc\nd\ne\n')).toBe(place(5));
    expect(after('\x1b[?2026l')).toBe('');
  });
  it('removes the placement once when the header falls back to one line, and places it again when it returns', () => {
    let shown = true;
    const after = bannerPainter({ tier: 'cursor', ...geometry, shown: () => shown, terminalRows: () => 30 });
    expect(after('a\nb\n')).toBe(place(2));
    shown = false;
    expect(after(ERASE_3 + 'line header\nb\n')).toBe(deletePlacement(31313, 1));
    expect(after(ERASE_3 + 'line header\nb\n')).toBe('');
    shown = true;
    expect(after(ERASE_3 + 'a\nb\n')).toBe(place(2));
  });
  it('removes the placement while the header is scrolled above a frame taller than the terminal', () => {
    const after = bannerPainter({ tier: 'cursor', ...geometry, shown: () => true, terminalRows: () => 4 });
    expect(after('a\nb\nc\n')).toBe(place(3));
    expect(after(ERASE_3 + 'a\nb\nc\nd\ne')).toBe(deletePlacement(31313, 1));
  });
  it('sends the image again after a screen clear, then places it', () => {
    const after = bannerPainter({ tier: 'cursor', ...geometry, shown: () => true, terminalRows: () => 30 });
    expect(after('a\nb\n')).toBe(place(2));
    expect(after(CLEAR + 'a\nb\nc')).toBe('RETRANSMIT' + place(2));
    // Nothing is left to delete after a clear, even if the header is hidden then.
    const hidden = bannerPainter({ tier: 'cursor', ...geometry, shown: () => false, terminalRows: () => 30 });
    expect(hidden(CLEAR + 'a\nb')).toBe('RETRANSMIT');
  });
});

describe('placeholder tier', () => {
  it('adds nothing to frames, and sends the image again after a screen clear', () => {
    const after = bannerPainter({ tier: 'placeholders', ...geometry, shown: () => true, terminalRows: () => 30 });
    expect(after('a\nb\nc\n')).toBe('');
    expect(after(ERASE_3 + 'a\n')).toBe('');
    expect(after(CLEAR + 'a\nb')).toBe('RETRANSMIT');
    expect(after(WINDOWS_CLEAR + 'a\nb')).toBe('RETRANSMIT');
  });
});

describe('sixel tier', () => {
  it('draws again after every visible frame and never transmits', () => {
    let shown = true;
    const after = bannerPainter({ tier: 'sixel', ...geometry, retransmit: '', sixel: 'SIXEL', shown: () => shown, terminalRows: () => 5 });
    expect(after('a\nb\n')).toBe(drawSixel('SIXEL', 2));
    expect(after(CLEAR + 'a\nb')).toBe(drawSixel('SIXEL', 1));
    expect(after('\x1b[?25h')).toBe('');
    expect(after('a\nb\nc\nd\ne\nf')).toBe('');
    shown = false;
    expect(after('a\n')).toBe('');
  });
});

describe('banner start per tier', () => {
  const piece = pickPiece('dark', true);
  const shown = () => true;
  const terminalRows = () => 30;
  it('placeholders: a random id in 16..255, the virtual placement, deleted on exit', () => {
    const banner = startBanner({ tier: 'placeholders', piece, cell: null, shown, terminalRows, random: () => 0.5 });
    expect(banner.image).toEqual({ id: 136, columns: 8, rows: 3, tier: 'placeholders' });
    expect(banner.start).toBe(transmitImage(136, piece));
    expect(banner.exit).toBe(deleteImage(136));
    expect(banner.after('\x1b[2J' + 'a')).toBe(transmitImage(136, piece));
  });
  it('cursor: the fixed id, data only, deleted on exit', () => {
    const banner = startBanner({ tier: 'cursor', piece, cell: null, shown, terminalRows });
    expect(banner.image).toEqual({ id: 31313, columns: 8, rows: 3, tier: 'cursor' });
    expect(banner.start).toBe(transmitData(31313, piece.png));
    expect(banner.exit).toBe(deleteImage(31313));
  });
  it('sixel: nothing to send or delete, the image scaled to the reported cell', () => {
    const banner = startBanner({ tier: 'sixel', piece, cell: { width: 9, height: 19 }, shown, terminalRows });
    expect(banner.image).toEqual({ id: 0, columns: 8, rows: 3, tier: 'sixel' });
    expect([banner.start, banner.exit]).toEqual(['', '']);
    expect(banner.after('a\n')).toBe(drawSixel(sixelImage(piece.bitmap, 8, 3, { width: 9, height: 19 }), 1));
  });
});

function fakeTTY(rows = 30) {
  const stream = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows });
  let written = '';
  stream.on('data', chunk => { written += chunk.toString(); });
  return { stream: stream as unknown as NodeJS.WriteStream, read: () => written, writes: [] as string[] };
}

describe('stdout wrapper', () => {
  it('passes every write through untouched, then appends what the painter asks for', () => {
    const target = { write: vi.fn(() => false), isTTY: true, columns: 80, rows: 24 } as unknown as NodeJS.WriteStream;
    const done = () => {};
    const wrapped = wrapStdout(target, chunk => chunk === 'frame\n' ? 'EXTRA' : '');
    expect(wrapped.write('frame\n', 'utf8', done)).toBe(false);
    expect(wrapped.write(Buffer.from('other'))).toBe(false);
    expect((target.write as ReturnType<typeof vi.fn>).mock.calls).toEqual([['frame\n', 'utf8', done], ['EXTRA'], [Buffer.from('other')]]);
    expect([wrapped.isTTY, wrapped.columns, wrapped.rows]).toEqual([true, 80, 24]);
  });
  it('keeps the stream\'s events: a resize listener added through it hears the real stream', () => {
    const { stream } = fakeTTY();
    const wrapped = wrapStdout(stream, () => '');
    let resized = 0;
    const listener = () => { resized++; };
    wrapped.on('resize', listener);
    stream.emit('resize');
    wrapped.off('resize', listener);
    stream.emit('resize');
    expect(resized).toBe(1);
  });
});

describe('mounted banner', () => {
  it('sends the image, configures the header and deletes the image on the exit event', () => {
    const { stream, read } = fakeTTY();
    const exitEvents = new EventEmitter();
    const piece = pickPiece('dark', true);
    const { banner } = mountBanner({ tier: 'cursor', piece, cell: null, stdout: stream, exitEvents });
    expect(read()).toBe(transmitData(31313, piece.png));
    expect(bannerSnapshot()).toEqual({ id: 31313, columns: 8, rows: 3, tier: 'cursor' });
    exitEvents.emit('exit');
    expect(read().endsWith(banner.exit)).toBe(true);
  });
  it('registers no exit write for sixel, which leaves nothing to delete', () => {
    const exitEvents = new EventEmitter();
    mountBanner({ tier: 'sixel', piece: pickPiece('dark', true), cell: null, stdout: fakeTTY().stream, exitEvents });
    expect(exitEvents.listenerCount('exit')).toBe(0);
  });
});

describe('cursor tier under Ink', () => {
  const pause = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
  function Frame({ lines }: { lines: number }) {
    return <Box flexDirection="column">{Array.from({ length: lines }, (_, line) => <Text key={line}>{`line ${line}`}</Text>)}</Box>;
  }
  it('follows every frame, hides while the header is off screen and comes back after Ink clears the screen', async () => {
    const tty = fakeTTY(10);
    const { stream } = tty;
    // Ink brackets each frame in a synchronized update; the banner bytes go inside it.
    const read = () => tty.read().replace(/\x1b\[\?2026l$/, '');
    configureBanner({ id: 31313, columns: 8, rows: 3, tier: 'cursor' });
    const after = bannerPainter({ tier: 'cursor', ...geometry, shown: () => true, terminalRows: () => 10 });
    const instance = render(<Frame lines={4} />, { stdout: wrapStdout(stream, after), patchConsole: false, exitOnCtrlC: false });
    try {
      await pause();
      expect(read().endsWith(place(4))).toBe(true);
      instance.rerender(<Frame lines={6} />); await pause();
      expect(read().endsWith(place(6))).toBe(true);
      // Taller than the terminal: Ink writes it whole, the header scrolls away.
      instance.rerender(<Frame lines={12} />); await pause();
      expect(read().endsWith(deletePlacement(31313, 1))).toBe(true);
      const before = read().length;
      // The frame after a full-height one is written after a full clear.
      instance.rerender(<Frame lines={3} />); await pause();
      const last = read().slice(before);
      expect(last).toContain('\x1b[2J');
      expect(last.indexOf('RETRANSMIT')).toBeGreaterThan(last.indexOf('line 2'));
      expect(last.endsWith('RETRANSMIT' + place(2))).toBe(true);
    } finally { instance.unmount(); }
    expect(read().split(place(4)).length - 1).toBe(1);
  });
});
