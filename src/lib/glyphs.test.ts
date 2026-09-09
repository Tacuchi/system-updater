import { describe, it, expect, vi } from 'vitest';
import { shouldUseAscii } from './glyphs.js';

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe('shouldUseAscii', () => {
  it('honours the TACUCHI_ASCII override either way', () => {
    expect(shouldUseAscii(env({ TACUCHI_ASCII: '1', WT_SESSION: '1' }), 'darwin')).toBe(true);
    expect(shouldUseAscii(env({ TACUCHI_ASCII: '0' }), 'win32')).toBe(false);
  });

  it('falls back to ASCII on a dumb terminal', () => {
    expect(shouldUseAscii(env({ TERM: 'dumb' }), 'linux')).toBe(true);
  });

  it('falls back to ASCII on a legacy Windows console (no WT_SESSION)', () => {
    expect(shouldUseAscii(env({}), 'win32')).toBe(true);
  });

  it('uses Unicode in Windows Terminal', () => {
    expect(shouldUseAscii(env({ WT_SESSION: '1' }), 'win32')).toBe(false);
  });

  it('uses Unicode on macOS / Linux by default', () => {
    expect(shouldUseAscii(env({}), 'darwin')).toBe(false);
    expect(shouldUseAscii(env({}), 'linux')).toBe(false);
  });
});

describe('el caso degradado sin Unicode queda legible', () => {
  /** Re-import with the ASCII set forced: `g` is resolved once at module load. */
  async function asciiGlyphs() {
    const previous = process.env['TACUCHI_ASCII'];
    process.env['TACUCHI_ASCII'] = '1';
    vi.resetModules();
    const mod = await import('./glyphs.js');
    if (previous === undefined) delete process.env['TACUCHI_ASCII'];
    else process.env['TACUCHI_ASCII'] = previous;
    return mod;
  }

  it('cada glifo de estado ocupa UNA celda, así que ninguna fila cambia de ancho', async () => {
    const { g } = await asciiGlyphs();
    const statusGlyphs = [
      g.pending, g.scanning, g.outdated, g.uptodate, g.running, g.done, g.failed, g.skipped, g.unknown,
    ];
    for (const glyph of statusGlyphs) {
      expect([...glyph]).toHaveLength(1);
      // Y es imprimible: nada de un carácter que la consola dibuje como caja.
      expect(glyph.codePointAt(0)).toBeLessThan(128);
    }
  });

  it('el glifo del estado nuevo es el mismo en los dos juegos: no necesita variante', async () => {
    const { g: ascii } = await asciiGlyphs();
    vi.resetModules();
    const { g: unicode } = await import('./glyphs.js');
    expect(ascii.unknown).toBe('?');
    expect(unicode.unknown).toBe('?');
  });

  it('sin animación el marco no depende de un temporizador', async () => {
    const { NO_ANIM, spinnerFrames } = await asciiGlyphs();
    expect(NO_ANIM).toBe(true);
    // Y aun así los cuadros del indicador miden una celda, por si se anima.
    for (const frame of spinnerFrames) expect([...frame]).toHaveLength(1);
  });
});
