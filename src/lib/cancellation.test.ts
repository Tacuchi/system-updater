import { describe, it, expect, vi } from 'vitest';
import { onProcessCancel, fireProcessCancel } from './cancellation.js';
import { signalRoutes } from './signals.js';
import type { TerminationMode } from './logger.js';

/** El modo que una señal declara en ese sistema, o null si no la atendemos. */
function modeOf(signal: string, platform: NodeJS.Platform): TerminationMode | null {
  return signalRoutes(platform).find(r => r.signal === signal)?.mode ?? null;
}
import { settleRun, isRunSettled, resetRunSettlement } from './run-closure.js';

describe('cancellation registry', () => {
  it('fires every registered handler', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onProcessCancel(a);
    const offB = onProcessCancel(b);
    fireProcessCancel();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it('stops calling a handler after it unregisters', () => {
    const a = vi.fn();
    const off = onProcessCancel(a);
    off();
    fireProcessCancel();
    expect(a).not.toHaveBeenCalled();
  });

  it('keeps firing the rest when one handler throws', () => {
    const bad = vi.fn(() => {
      throw new Error('x');
    });
    const good = vi.fn();
    const offBad = onProcessCancel(bad);
    const offGood = onProcessCancel(good);
    expect(() => fireProcessCancel()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});

describe('qué señales se atienden, por sistema', () => {
  it('en unix no se declara SIGBREAK, que ahí no existe', () => {
    for (const platform of ['darwin', 'linux'] as NodeJS.Platform[]) {
      const signals = signalRoutes(platform).map(r => r.signal);
      expect(signals).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
      expect(signals).not.toContain('SIGBREAK');
    }
  });

  it('en Windows se agrega SIGBREAK (Ctrl+Break) sin quitar ninguna', () => {
    const signals = signalRoutes('win32').map(r => r.signal);
    expect(signals).toContain('SIGBREAK');
    for (const common of ['SIGINT', 'SIGTERM', 'SIGHUP']) expect(signals).toContain(common);
  });

  it('el cierre de terminal se atiende en LOS TRES sistemas', () => {
    // Es la ruta con menos margen y la que nadie puede reintentar: cerrar la
    // ventana dejaba el registro trunco, sin una sola línea que lo dijera.
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      expect(modeOf('SIGHUP', platform)).toBe('interrumpida');
    }
  });

  it('lo que la persona decide y lo que el entorno decide no se llaman igual', () => {
    expect(modeOf('SIGINT', 'darwin')).toBe('cancelada');
    expect(modeOf('SIGBREAK', 'win32')).toBe('cancelada');
    expect(modeOf('SIGTERM', 'linux')).toBe('interrumpida');
    expect(modeOf('SIGHUP', 'linux')).toBe('interrumpida');
  });

  it('una señal que no atendemos no inventa un modo', () => {
    expect(modeOf('SIGBREAK', 'darwin')).toBeNull();
    expect(modeOf('SIGUSR2', 'linux')).toBeNull();
  });

  it('cada código de salida es el convencional 128 + número de señal', () => {
    const byName = new Map(signalRoutes('win32').map(r => [r.signal, r.code]));
    expect(byName.get('SIGINT')).toBe(130);
    expect(byName.get('SIGHUP')).toBe(129);
    expect(byName.get('SIGTERM')).toBe(143);
  });
});

describe('el cierre del registro no depende del margen que dé el sistema', () => {
  it('settleRun escribe y cierra de forma SINCRÓNICA, antes de cualquier temporizador', () => {
    // Es lo que hace que la ruta de cierre de terminal valga igual en Windows,
    // donde el margen lo controla el sistema operativo: no se espera nada.
    resetRunSettlement();
    const first = settleRun('interrumpida', 'señal SIGHUP');
    expect(first).toBe(true);
    expect(isRunSettled()).toBe(true);
    // Idempotente: la segunda ruta de salida que llegue no reescribe el modo.
    expect(settleRun('completa')).toBe(false);
    resetRunSettlement();
  });
});
