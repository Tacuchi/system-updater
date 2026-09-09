import { describe, it, expect, vi } from 'vitest';
import { getVersion } from './version.js';
import { checkForNewerSelf, isNewer, howToUpgrade } from './self-update.js';
import type { SelfCheckDeps, SelfCheckState } from './self-update.js';

describe('getVersion', () => {
  it('reads a real semver from package.json (not the stale hardcoded 1.0.0)', () => {
    const v = getVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(v).not.toBe('0.0.0'); // 0.0.0 would mean package.json was not found
  });

  it('is cached (stable across calls)', () => {
    expect(getVersion()).toBe(getVersion());
  });
});

describe('isNewer', () => {
  it('compara por semver, no por texto', () => {
    expect(isNewer('2.2.1', '2.10.0')).toBe(true);
    expect(isNewer('2.10.0', '2.2.1')).toBe(false);
    expect(isNewer('2.2.1', '2.2.1')).toBe(false);
    expect(isNewer('2.2.1', '3.0.0')).toBe(true);
  });

  it('una pre-release no le gana a la estable del mismo número', () => {
    expect(isNewer('2.3.0', '2.3.0-beta.1')).toBe(false);
  });
});

/** Reloj y red inyectados: la cadencia y el fallo se prueban sin salir a internet. */
function harness(o: { now: number; state?: SelfCheckState | null; latest?: string; fail?: string }) {
  const queries: number[] = [];
  let written: SelfCheckState | null = o.state ?? null;
  const deps: SelfCheckDeps = {
    now: () => o.now,
    fetchLatest: async () => {
      queries.push(o.now);
      if (o.fail) throw new Error(o.fail);
      return o.latest ?? '0.0.0';
    },
    readState: () => written,
    writeState: s => {
      written = s;
    },
  };
  return { deps, queries, state: () => written };
}

const DAY = 24 * 60 * 60 * 1000;

describe('auto-chequeo de la versión propia', () => {
  it('avisa de una versión más nueva y dice cómo obtenerla', async () => {
    const h = harness({ now: 1_000_000, latest: '2.3.0' });
    const out = await checkForNewerSelf('2.2.1', true, h.deps);
    expect(out.newer).toBe('2.3.0');
    expect(out.howTo).toBe(howToUpgrade('2.3.0'));
    expect(out.queried).toBe(true);
  });

  it('no consulta dos veces en la misma ventana de 24 horas', async () => {
    const h = harness({ now: 5 * DAY, state: { lastCheckedAt: 5 * DAY - 1_000, latest: '2.3.0' } });
    const out = await checkForNewerSelf('2.2.1', true, h.deps);
    expect(h.queries).toEqual([]);
    // Y sigue avisando desde el caché: la ventana ahorra red, no el aviso.
    expect(out.newer).toBe('2.3.0');
    expect(out.queried).toBe(false);
  });

  it('vuelve a consultar cuando la ventana venció', async () => {
    const h = harness({ now: 5 * DAY, state: { lastCheckedAt: 5 * DAY - DAY - 1 }, latest: '2.3.0' });
    await checkForNewerSelf('2.2.1', true, h.deps);
    expect(h.queries).toHaveLength(1);
  });

  it('desactivado no consulta ni dice nada', async () => {
    const h = harness({ now: 1, latest: '9.9.9' });
    const out = await checkForNewerSelf('2.2.1', false, h.deps);
    expect(h.queries).toEqual([]);
    expect(out.newer).toBeNull();
    expect(out.queried).toBe(false);
  });

  it('sin red no dice nada al flujo, y no arranca el reloj de 24 horas', async () => {
    const h = harness({ now: 42, fail: 'getaddrinfo ENOTFOUND' });
    const out = await checkForNewerSelf('2.2.1', true, h.deps);
    expect(out.newer).toBeNull();
    // El estado NO se escribió: un fallo no compra un día de silencio.
    expect(h.state()).toBeNull();
  });

  it('el fallo queda explícito en el registro aunque sea invisible para el flujo', async () => {
    const warn = vi.spyOn(await import('./logger.js'), 'warn');
    const h = harness({ now: 42, fail: 'ECONNRESET' });
    await checkForNewerSelf('2.2.1', true, h.deps);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no se pudo consultar'));
    warn.mockRestore();
  });

  it('estar al día no produce ningún aviso', async () => {
    const h = harness({ now: 1, latest: '2.2.1' });
    expect((await checkForNewerSelf('2.2.1', true, h.deps)).newer).toBeNull();
  });
});
