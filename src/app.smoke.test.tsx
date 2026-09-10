import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { g } from './lib/glyphs.js';
import { closeLogger } from './lib/logger.js';

// Mock detection so the smoke is hermetic + fast (no real package-manager spawns).
//
// TWO managers on purpose: one that reports a percentage and one that does not.
// 25 of the 27 real managers report none, which is why the row's detail slot sat
// empty for minutes — and it is the only way to check that the slot shows a
// percentage OR a time and never both. `brew` carries twenty packages so the
// per-package detail screen has a real list to render.
const BREW_PACKAGES = Array.from({ length: 20 }, (_, i) =>
  i === 0
    ? { name: 'git', currentVersion: '2.40', newVersion: '2.44' }
    : { name: `pkg-${i}`, currentVersion: `1.${i}.0`, newVersion: `1.${i}.1` },
);

// 20 de brew + `left-pad` de npm. El contador de la pantalla de selección es la
// única prueba observable de que una tecla llegó a destino.
const TOTAL_PACKAGES = BREW_PACKAGES.length + 1;

vi.mock('./managers/registry.js', () => ({
  detectManagers: async () => [
    {
      manager: {
        id: 'brew',
        platforms: ['darwin', 'linux', 'win32'],
        requiresAdmin: false,
        group: 'system',
        detect: async () => ({ available: true, version: '4.0' }),
        listOutdated: async () => BREW_PACKAGES,
        async *upgrade() {
          yield { type: 'log', message: 'brew upgrade git' };
          yield { type: 'progress', message: 'downloading', percent: 50 };
          await new Promise(r => setTimeout(r, 120));
          return {
            success: true,
            upgraded: BREW_PACKAGES.length,
            failed: 0,
            errors: [],
            status: 'success',
            managerId: 'brew',
            packages: BREW_PACKAGES.map(p => ({
              name: p.name,
              outcome: 'upgraded',
              fromVersion: p.currentVersion,
              toVersion: p.newVersion,
            })),
          };
        },
      },
      detection: { available: true, version: '4.0' },
    },
    {
      manager: {
        id: 'npm',
        platforms: ['darwin', 'linux', 'win32'],
        requiresAdmin: false,
        group: 'language',
        detect: async () => ({ available: true, version: '10.0' }),
        listOutdated: async () => [{ name: 'left-pad', currentVersion: '1.0.0', newVersion: '1.3.0' }],
        // No percent event ever: this is the row whose detail slot must show a time.
        async *upgrade() {
          yield { type: 'log', message: 'npm update -g left-pad' };
          await new Promise(r => setTimeout(r, 120));
          return {
            success: true,
            upgraded: 1,
            failed: 0,
            errors: [],
            status: 'success',
            managerId: 'npm',
            packages: [{ name: 'left-pad', outcome: 'upgraded', fromVersion: '1.0.0', toVersion: '1.3.0' }],
          };
        },
      },
      detection: { available: true, version: '10.0' },
    },
  ],
}));

import App from './app.js';

// Mounting the app boots the real logger. Without this, every `npm test` appended
// a run to the deposit the user actually reads — which is also the deposit the
// retention work has to measure.
let previousLogDir: string | undefined;
let previousConfigDir: string | undefined;
let tmpLogRoot: string;
beforeAll(() => {
  previousLogDir = process.env['TACUCHI_UPDATER_LOG_DIR'];
  previousConfigDir = process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  tmpLogRoot = mkdtempSync(join(tmpdir(), 'updater-test-logs-'));
  process.env['TACUCHI_UPDATER_LOG_DIR'] = tmpLogRoot;
  const cfg = join(tmpLogRoot, 'config');
  process.env['TACUCHI_UPDATER_CONFIG_DIR'] = cfg;
  // Seeded, not defaulted: mounting the app fires the self-version check, and a
  // test must not reach the npm registry.
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, 'config.json'), JSON.stringify({ selfCheck: false }), 'utf-8');

});
afterAll(() => {
  if (previousLogDir === undefined) delete process.env['TACUCHI_UPDATER_LOG_DIR'];
  else process.env['TACUCHI_UPDATER_LOG_DIR'] = previousLogDir;
  if (previousConfigDir === undefined) delete process.env['TACUCHI_UPDATER_CONFIG_DIR'];
  else process.env['TACUCHI_UPDATER_CONFIG_DIR'] = previousConfigDir;
  // Montar la app abre el log DE VERDAD. Sin cerrarlo, Windows se niega a
  // borrar un archivo con handle abierto y el borrado del temporal tumbaba el
  // archivo entero con ENOTEMPTY, mientras las otras dos patas pasaban.
  closeLogger();
  rmSync(tmpLogRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

// Este archivo maneja la app React de verdad por cinco pantallas; no es una
// prueba unitaria y el plazo de 5 s por defecto no le corresponde.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/**
 * Esperar a que el marco diga algo, con un plazo DE PARED.
 *
 * La primera versión de estos ayudantes contaba ticks (`for (let i = 0; i < 60;)`
 * cada 40 ms): un presupuesto de ~2,4 s que se sostiene en una laptop ociosa y no
 * en un runner corriendo 54 archivos a la vez. El mismo commit daba 376/376 local
 * y fallaba las TRES patas de CI con
 * `expected ' @tacuchi/updater v3.0.0 …' to contain 'COMPLETADO'`. Un plazo así
 * de amplio no puede tambalear, y un cuelgue real sigue fallando — con el mensaje
 * de abajo, que lleva el marco adentro en vez de dejar adivinando en qué pantalla
 * se quedó.
 */
const WAIT_MS = 15_000;

/** Lo mínimo de un handle de ink-testing-library que estos ayudantes necesitan. */
interface Handle {
  stdin: { write: (s: string) => void };
  lastFrame: () => string | undefined;
}

/**
 * Mandar una tecla hasta que el marco demuestre que llegó.
 *
 * Ink 6 no suscribe cada `useInput` a `stdin`: los reparte desde un emisor
 * interno, y cada hook se engancha ahí en un efecto de React. Cuando la pantalla
 * aparece por una actualización ASÍNCRONA —`detect` → `scan` → `select` llega de
 * una promesa— ese efecto se vacía DESPUÉS de que el marco ya está escrito, así
 * que hay una ventana en la que el marco nuevo ya es observable y el teclado de
 * esa pantalla todavía no está enchufado. El handler de `App`, que sí lo está,
 * consume la tecla y la ignora: se DESCARTA sin error. La pantalla se quedaba en
 * `0 / 21 seleccionados` para siempre, y el Enter siguiente no tenía nada que
 * confirmar. Eso, y no la lentitud del runner, es lo que ponía a CI en rojo —las
 * tres patas, una prueba por pata, siempre la primera que toca una tecla— con
 * 376/376 acá.
 *
 * Medido en aislamiento (una raíz con su `useInput` más una pantalla montada por
 * una promesa, la tecla escrita en el turno en que su marco se vuelve
 * observable): 9 de 20 corridas la descartan, y el reenvío la recuperó en 20 de
 * 20. En el montaje inicial NO pasa: ahí React vacía el efecto antes de que el
 * marco se pueda leer, y por eso la versión anterior de este archivo pasaba en
 * una laptop y no en un runner.
 *
 * Reenviar es seguro para TODAS las teclas que usa este archivo: `a` (marcar
 * todo) es idempotente, y los interruptores (`espacio`, `d`) convergen porque se
 * mira el marco antes de cada envío y se corta en cuanto la aguja aparece. El
 * único Enter que NO se reenvía es el de la selección: un segundo Enter arrancaría
 * la corrida y se saltaría la confirmación — y no hace falta, porque el contador
 * ya probó que ese teclado está enchufado.
 */
async function pressUntil(h: Handle, key: string, needle: string, what: string): Promise<string> {
  const deadline = Date.now() + WAIT_MS;
  for (let sent = 0; ; sent++) {
    if ((h.lastFrame() ?? '').includes(needle)) return h.lastFrame() ?? '';
    if (Date.now() > deadline) {
      throw new Error(
        `${what}: ${JSON.stringify(key)} no llevó a "${needle}" en ${WAIT_MS} ms tras ${sent} envíos; se ve:\n${h.lastFrame() ?? ''}`,
      );
    }
    h.stdin.write(key);
    for (let i = 0; i < 8; i++) {
      await tick(25);
      if ((h.lastFrame() ?? '').includes(needle)) return h.lastFrame() ?? '';
    }
  }
}
async function waitFor(lastFrame: () => string | undefined, needle: string, what: string): Promise<string> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const frame = lastFrame() ?? '';
    if (frame.includes(needle)) return frame;
    if (Date.now() > deadline) {
      throw new Error(`${what}: esperaba "${needle}" y a los ${WAIT_MS} ms se ve:\n${frame}`);
    }
    await tick(25);
  }
}

describe('App (linear flow) smoke', () => {
  it('mounts, renders the shell header, and walks detect → select', async () => {
    const { lastFrame, unmount } = render(<App sudoMode={false} />);
    expect(lastFrame() ?? '').toContain('@tacuchi/updater');
    const frame = await waitFor(lastFrame, '2.44', 'detect + scan');
    expect(frame).toContain('git');
    expect(frame).toContain('2.44');
    unmount();
  });

  it('drives select → confirm → update → summary and reports real success', async () => {
    const h = render(<App sudoMode={false} />);
    await waitFor(h.lastFrame, 'Espacio marcar', 'detect + scan → select');

    // El espacio marca la fila del cursor (git), y el contador lo demuestra.
    await pressUntil(h, ' ', `1 / ${TOTAL_PACKAGES} seleccionados`, 'marcar la fila del cursor');
    h.stdin.write('\r'); // enter → confirm (un solo envío: el teclado ya probó estar vivo)
    await waitFor(h.lastFrame, 'Se ejecutará', 'select → confirm');

    const frame = await pressUntil(h, '\r', 'COMPLETADO', 'confirm → run → summary');
    expect(frame).toContain('1'); // 1 upgraded
    h.unmount();
  });
});

/**
 * Drive the flow to the summary with keys, NOT with the non-interactive driver:
 * that one exits Ink as soon as the summary appears, so there would be nothing
 * left to press a key into.
 */
async function toSummary() {
  const h = render(<App sudoMode={false} />);
  await waitFor(h.lastFrame, 'Espacio marcar', 'toSummary: detect + scan → select');
  // `a` marca todo y es idempotente, así que se puede reenviar sin miedo.
  await pressUntil(h, 'a', `${TOTAL_PACKAGES} / ${TOTAL_PACKAGES} seleccionados`, 'toSummary: marcar todo');
  h.stdin.write('\r'); // → confirm (un solo envío: el teclado ya probó estar vivo)
  await waitFor(h.lastFrame, 'Se ejecutará', 'toSummary: select → confirm');
  await pressUntil(h, '\r', 'COMPLETADO', 'toSummary: confirm → run → summary');
  return h;
}

/** Press a key and wait until the frame actually reflects it. */
async function press(h: Handle, key: string, until: string): Promise<string> {
  return pressUntil(h, key, until, `la tecla '${key}'`);
}

describe('el detalle por paquete (DES-001@r1)', () => {
  it('se abre y se cierra con la MISMA tecla, y vuelve al resumen', async () => {
    const { lastFrame, stdin, unmount } = await toSummary();
    expect(lastFrame() ?? '').toContain('COMPLETADO');

    await press({ stdin, lastFrame }, 'd', 'Detalle por paquete');
    expect(lastFrame() ?? '').not.toContain('COMPLETADO');

    await press({ stdin, lastFrame }, 'd', 'COMPLETADO');
    unmount();
  });

  it('con veinte paquetes no desborda ni cambia el alto del marco', async () => {
    const { lastFrame, stdin, unmount } = await toSummary();
    await press({ stdin, lastFrame }, 'd', 'Detalle por paquete');
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');

    // No desborda a lo alto: la ventana se acota al alto de la terminal y lo que
    // sobra se anuncia, en vez de empujar el marco hacia arriba.
    expect(lines.length).toBeLessThanOrEqual(24);
    expect(frame).toContain(g.scrollDown);
    // Ni a lo ancho: ninguna línea pasa las columnas disponibles.
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(100);
    // Y dice de qué versión a qué versión, que es lo que el resumen no podía.
    expect(frame).toContain('2.40');
    expect(frame).toContain('2.44');

    // El alto no cambia entre dos dibujados del mismo estado.
    const again = (lastFrame() ?? '').split('\n').length;
    expect(again).toBe(lines.length);

    // Y la cola de la lista es alcanzable: recorrerla no cambia el alto del marco.
    const scrolled = await press({ stdin, lastFrame }, 'j', g.scrollUp);
    expect(scrolled.split('\n').length).toBe(lines.length);
    unmount();
  });

  it('el resumen nombra lo pendiente y ofrece el detalle por encima del total', async () => {
    const { lastFrame, unmount } = await toSummary();
    const frame = lastFrame() ?? '';
    // La fila de un gestor con más de un paquete dice cuántos cambiaron, en vez
    // de quedar vacía porque no había exactamente uno.
    expect(frame).toContain('20 actualizados');
    // Y la tecla se ofrece en la línea de ayuda, no dentro de una celda de datos.
    expect(frame).toContain('D detalle');
    unmount();
  });
});

describe('la fila del gestor en curso muestra porcentaje O tiempo, nunca ambos', () => {
  it('el que reporta porcentaje muestra porcentaje; el que no, tiempo', async () => {
    const { lastFrame, frames, unmount } = render(<App sudoMode={false} nonInteractive />);
    // Esperar a que la pantalla de actualización esté visible con las dos filas.
    await waitFor(lastFrame, 'ACTUALIZANDO', 'run → updating');
    const updating = frames.filter(f => f.includes('ACTUALIZANDO'));
    expect(updating.length).toBeGreaterThan(0);

    for (const frame of updating) {
      for (const line of frame.split('\n')) {
        if (!line.includes('ACTUALIZANDO')) continue;
        const hasPercent = /\d+%/.test(line);
        const hasElapsed = /\d+(s|m\d\ds|h\d\dm)\b/.test(line);
        // Los dos a la vez harían que el ancho de la fila dependa del gestor.
        expect(hasPercent && hasElapsed).toBe(false);
      }
    }
    unmount();
  });
});
