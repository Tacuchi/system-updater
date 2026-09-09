import { describe, it, expect, vi } from 'vitest';
import { onProcessCancel, fireProcessCancel } from './cancellation.js';
import { answerSignal, signalRoutes, SIGNAL_GRACE_MS } from './signals.js';
import type { SignalEffects } from './signals.js';
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

describe('answerSignal: el orden es el arreglo', () => {
  /** Registra QUÉ efecto corrió y en qué orden. Nada de esto es simulado por mí:
   *  es el mismo `answerSignal` que cli.tsx le pasa a process.on. */
  function recorder(o: { unmountThrows?: boolean } = {}) {
    const orden: string[] = [];
    let scheduled: (() => void) | null = null;
    let scheduledMs = -1;
    let exitedWith = -1;
    const effects: SignalEffects = {
      settle: (mode, detail) => orden.push(`settle:${mode}:${detail}`),
      cancel: () => orden.push('cancel'),
      unmount: () => {
        orden.push('unmount');
        if (o.unmountThrows) throw new Error('console I/O falló durante el cierre');
      },
      exit: code => {
        orden.push('exit');
        exitedWith = code;
      },
      schedule: (fn, ms) => {
        scheduled = fn;
        scheduledMs = ms;
      },
    };
    return { orden, effects, run: () => scheduled?.(), ms: () => scheduledMs, code: () => exitedWith };
  }

  const sighup = signalRoutes('win32').find(r => r.signal === 'SIGHUP')!;

  it('el cierre se escribe ANTES de cancelar, porque cancelar hace spawn', () => {
    // `tree-kill` corre `taskkill /pid X /T /F` en win32 —un CreateProcess de
    // cmd.exe— y `pgrep` en darwin. Ese spawn delante de la única línea que tiene
    // que sobrevivir gasta el margen del sistema antes de que haya un byte en
    // disco. El margen documentado de Windows es 5000 ms (SPI_GETHUNGAPPTIMEOUT).
    const r = recorder();
    answerSignal(sighup, r.effects);
    expect(r.orden).toEqual(['settle:interrumpida:señal SIGHUP', 'cancel']);
  });

  it('recién después sale, con margen para que el kill alcance a correr', () => {
    const r = recorder();
    answerSignal(sighup, r.effects);
    expect(r.orden).not.toContain('exit');
    expect(r.ms()).toBe(SIGNAL_GRACE_MS);
    expect(SIGNAL_GRACE_MS).toBeLessThan(5000);
    r.run();
    expect(r.orden).toEqual(['settle:interrumpida:señal SIGHUP', 'cancel', 'unmount', 'exit']);
    expect(r.code()).toBe(129);
  });

  it('si unmount tira, IGUAL sale con el código de la señal', () => {
    // Microsoft documenta que las funciones de consola pueden no ser fiables
    // mientras se procesa un cierre; y libuv deja el hilo del handler en
    // Sleep(INFINITE), así que un unmount que tira dejaría el proceso colgado
    // hasta que Windows lo mate, y el código de salida dejaría de ser el de la señal.
    const r = recorder({ unmountThrows: true });
    answerSignal(sighup, r.effects);
    r.run();
    expect(r.orden).toEqual(['settle:interrumpida:señal SIGHUP', 'cancel', 'unmount', 'exit']);
    expect(r.code()).toBe(129);
  });

  it('cada señal lleva su modo y su código a través del mismo camino', () => {
    for (const route of signalRoutes('win32')) {
      const r = recorder();
      answerSignal(route, r.effects);
      r.run();
      expect(r.orden[0]).toBe(`settle:${route.mode}:señal ${route.signal}`);
      expect(r.code()).toBe(route.code);
    }
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
