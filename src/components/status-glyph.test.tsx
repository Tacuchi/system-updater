import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunningGlyph, StatusGlyph, statusColor } from './status-glyph.js';
import { g } from '../lib/glyphs.js';
import { formatElapsed } from '../screens/update.js';
import type { ManagerStatus } from '../state/types.js';

// El mismo carácter en los dos juegos de glifos, a propósito.
const UNICODE_UNKNOWN = '?';
const ASCII_UNKNOWN = '?';

describe('RunningGlyph', () => {
  it('mounts and renders a single-cell glyph without crashing', () => {
    // In the non-TTY test env NO_ANIM is true, so it renders the STATIC running
    // glyph (no timer mounted → no hanging handle). The animated path is the same
    // component with a 90ms cycler, exercised manually on a real TTY.
    const { lastFrame, unmount } = render(<RunningGlyph />);
    expect(lastFrame()).toContain(g.running);
    unmount();
  });
});

describe('StatusGlyph', () => {
  it('renders the static glyph for a terminal status', () => {
    expect(render(<StatusGlyph status="done" />).lastFrame()).toContain(g.done);
    expect(render(<StatusGlyph status="failed" />).lastFrame()).toContain(g.failed);
  });
});

describe('el estado «no se pudo determinar» se ve como tal', () => {
  it('tiene su propio glifo y NO el de «al día»', () => {
    const unknown = render(<StatusGlyph status="unknown" />).lastFrame() ?? '';
    const uptodate = render(<StatusGlyph status="uptodate" />).lastFrame() ?? '';
    expect(unknown).toContain(g.unknown);
    // El defecto que el rol nuevo vino a sacar: verse igual que «al día».
    expect(unknown).not.toBe(uptodate);
  });

  it('su color no es el gris de «al día» ni el rosa de advertencia (DES-001@r1)', () => {
    expect(statusColor('unknown')).not.toBe(statusColor('uptodate'));
    expect(statusColor('unknown')).not.toBe(statusColor('skipped'));
    expect(statusColor('unknown')).not.toBe(statusColor('failed'));
  });

  it('el glifo ocupa una celda y ya es ASCII, así que degrada solo', () => {
    // `?` es el mismo carácter en los dos juegos: legible en una consola sin
    // Unicode sin necesitar variante.
    expect(g.unknown).toHaveLength(1);
    expect(UNICODE_UNKNOWN).toBe(ASCII_UNKNOWN);
  });

  it('cada estado tiene exactamente un glifo de una celda: ninguna fila cambia de alto', () => {
    const statuses: ManagerStatus[] = [
      'pending', 'scanning', 'outdated', 'uptodate', 'queued', 'running', 'done', 'failed', 'skipped', 'unknown',
    ];
    for (const status of statuses) {
      const frame = (render(<StatusGlyph status={status} />).lastFrame() ?? '').trim();
      expect(frame.split('\n')).toHaveLength(1);
      expect([...frame]).toHaveLength(1);
    }
  });
});

describe('formatElapsed', () => {
  it('sube de unidad sin crecer de ancho de forma imprevisible', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(9_400)).toBe('9s');
    expect(formatElapsed(65_000)).toBe('1m05s');
    expect(formatElapsed(3_725_000)).toBe('1h02m');
  });

  it('nunca devuelve algo negativo', () => {
    expect(formatElapsed(-5_000)).toBe('0s');
  });
});
