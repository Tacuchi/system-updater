import { describe, it, expect } from 'vitest';
import { fromDescriptor } from './engine.js';
import { ListingUnavailableError } from './listing.js';
import type { ExecDeps } from './engine.js';
import type { ManagerDescriptor } from './descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';
import { normalizeConfig } from '../lib/config.js';
import { getLogEntries } from '../lib/logger.js';

const cfg = normalizeConfig({});

/** An ExecResult with the two honesty fields defaulted: ran, did not time out. */
function ran(stdout: string, exitCode = 0, extra: { timedOut?: boolean; spawnFailed?: boolean } = {}) {
  return { stdout, stderr: '', exitCode, timedOut: false, spawnFailed: false, ...extra };
}

function parseLines(stdout: string): OutdatedPackage[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [name, currentVersion, newVersion] = l.split(/\s+/);
      return { name: name!, currentVersion: currentVersion ?? '?', newVersion: newVersion ?? '?' };
    });
}

const fooDescriptor: ManagerDescriptor = {
  id: 'foo',
  group: 'language',
  platforms: ['darwin', 'linux', 'win32'],
  requiresAdmin: false,
  kind: 'direct',
  detectCmd: { cmd: 'foo', args: ['--version'] },
  parseVersion: stdout => stdout.trim(),
  listOutdatedCmd: () => ({ cmd: 'foo', args: ['outdated'] }),
  parseOutdated: stdout => parseLines(stdout),
  upgradeCmd: pkgs => ({ cmd: 'foo', args: ['upgrade', ...(pkgs ?? [])] }),
};

// Stateful fake: list responses are consumed in order (before, then verify-after).
function makeDeps(o: {
  version?: string;
  outdatedQueue: string[];
  upgradeExit?: number;
  upgradeStderr?: string;
  lines?: string[];
}): ExecDeps & { calls: string[] } {
  let idx = 0;
  const calls: string[] = [];
  return {
    calls,
    async execCommand(cmd, args) {
      calls.push([cmd, ...args].join(' '));
      if (args.includes('--version')) return ran(o.version ?? '1.0.0');
      if (args.includes('outdated')) return ran(o.outdatedQueue[idx++] ?? '');
      return ran('');
    },
    async *runStream(cmd, args, _opts, pp): AsyncGenerator<ProgressEvent, CommandRecord> {
      calls.push([cmd, ...args].join(' '));
      for (const line of o.lines ?? []) {
        const p = pp?.(line);
        yield p !== undefined ? { type: 'progress', message: line, percent: p } : { type: 'log', message: line };
      }
      return {
        cmd: [cmd, ...args].join(' '),
        exitCode: o.upgradeExit ?? 0,
        durationMs: 1,
        timedOut: false,
        stdoutTail: '',
        stderrTail: o.upgradeStderr ?? '',
      };
    },
  };
}

async function drain(gen: AsyncGenerator<ProgressEvent, UpgradeResult>) {
  const events: ProgressEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

describe('fromDescriptor', () => {
  it('detects availability and parses the version', async () => {
    const mgr = fromDescriptor(fooDescriptor, cfg, makeDeps({ version: '1.2.3', outdatedQueue: [] }));
    expect(await mgr.detect()).toEqual({ available: true, version: '1.2.3' });
  });

  it('lists outdated packages via the parser', async () => {
    const mgr = fromDescriptor(fooDescriptor, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0\nb 1.0 2.0'] }));
    const out = await mgr.listOutdated();
    expect(out.map(p => p.name)).toEqual(['a', 'b']);
  });

  it('reports real success when packages are no longer outdated after upgrade', async () => {
    // before: a,b outdated → after verify: none outdated
    const mgr = fromDescriptor(fooDescriptor, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0\nb 1.0 2.0', ''] }));
    const { result } = await drain(mgr.upgrade());
    expect(result.status).toBe('success');
    expect(result.success).toBe(true);
    expect(result.upgraded).toBe(2);
  });

  it('CANNOT fake success: a non-zero upgrade with still-outdated packages fails', async () => {
    // before: a,b outdated → upgrade exits 1 → after verify: a,b STILL outdated
    const mgr = fromDescriptor(
      fooDescriptor,
      cfg,
      makeDeps({ outdatedQueue: ['a 1.0 2.0\nb 1.0 2.0', 'a 1.0 2.0\nb 1.0 2.0'], upgradeExit: 1, upgradeStderr: 'boom' }),
    );
    const { result } = await drain(mgr.upgrade());
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.failed).toBe(2);
    expect(result.commands?.length).toBeGreaterThan(0);
  });

  it('emits percent via the descriptor percentParser', async () => {
    const d: ManagerDescriptor = { ...fooDescriptor, percentParser: line => (line.includes('50') ? 50 : undefined) };
    const mgr = fromDescriptor(d, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0', ''], lines: ['working 50%'] }));
    const { events } = await drain(mgr.upgrade());
    expect(events.some(e => e.percent === 50)).toBe(true);
  });

  it('readonly managers return a noop with a manual command instead of fake success', async () => {
    const ro: ManagerDescriptor = {
      ...fooDescriptor,
      kind: 'readonly',
      manualCommand: () => 'sudo foo upgrade',
    };
    const mgr = fromDescriptor(ro, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0'] }));
    const { result } = await drain(mgr.upgrade());
    expect(result.status).toBe('noop');
    expect(result.success).toBe(false);
    expect(result.manualCommand).toBe('sudo foo upgrade');
  });

  it('threads the AbortSignal into runStream so a run is cancellable (Esc)', async () => {
    const ac = new AbortController();
    let captured: AbortSignal | undefined;
    const deps: ExecDeps = {
      async execCommand() {
        return ran('');
      },
      async *runStream(_cmd, _args, opts) {
        captured = opts.signal;
        return { cmd: 'x', exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    };
    const mgr = fromDescriptor(fooDescriptor, cfg, deps);
    await drain(mgr.upgrade(['a'], false, ac.signal));
    expect(captured).toBe(ac.signal);
  });

  it('admin managers without sudo mode return the manual command', async () => {
    const adm: ManagerDescriptor = {
      ...fooDescriptor,
      requiresAdmin: true,
      manualCommand: () => 'sudo foo upgrade',
    };
    const mgr = fromDescriptor(adm, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0'] }));
    const { result } = await drain(mgr.upgrade(undefined, false));
    expect(result.status).toBe('noop');
    expect(result.manualCommand).toBe('sudo foo upgrade');
  });
});

/** The trace of a probe/listing, taken from the log's own buffer. */
function traceSince(before: number): string[] {
  return getLogEntries()
    .slice(before)
    .map(e => e.message);
}

describe('la detección y el escaneo dejan traza', () => {
  it('un sondeo deja su comando, su espera y su resultado', async () => {
    const before = getLogEntries().length;
    const mgr = fromDescriptor(fooDescriptor, cfg, makeDeps({ version: '1.2.3', outdatedQueue: [] }));
    await mgr.detect();
    const line = traceSince(before).find(m => m.includes('foo: detect'));
    expect(line).toBeDefined();
    expect(line).toContain('cmd="foo --version"');
    expect(line).toContain('timeout=5000ms');
    expect(line).toContain('exit=0');
    expect(line).toContain('→ disponible version=1.2.3');
  });

  it('un binario que no se puede lanzar es ausente, y se registra como tal', async () => {
    const before = getLogEntries().length;
    const mgr = fromDescriptor(fooDescriptor, cfg, {
      async execCommand() {
        return ran('', 127, { spawnFailed: true });
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    });
    expect(await mgr.detect()).toEqual({ available: false });
    expect(traceSince(before).find(m => m.includes('foo: detect'))).toContain('→ ausente');
  });

  it('un sondeo que corre y no puede decidir es INDETERMINADO, no ausente', async () => {
    const before = getLogEntries().length;
    const mgr = fromDescriptor(fooDescriptor, cfg, {
      async execCommand() {
        return ran('', 3);
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    });
    expect(await mgr.detect()).toEqual({ available: false, undetermined: true });
    const line = traceSince(before).find(m => m.includes('foo: detect'));
    expect(line).toContain('exit=3');
    expect(line).toContain('→ indeterminado');
  });

  it('un sondeo que expira es indeterminado y lo dice', async () => {
    const before = getLogEntries().length;
    const mgr = fromDescriptor(fooDescriptor, cfg, {
      async execCommand() {
        return ran('', 1, { timedOut: true });
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    });
    expect((await mgr.detect()).undetermined).toBe(true);
    expect(traceSince(before).find(m => m.includes('foo: detect'))).toContain('→ indeterminado (expiró)');
  });

  it('un listado deja su duración y cuántos pendientes arrojó', async () => {
    const before = getLogEntries().length;
    const mgr = fromDescriptor(fooDescriptor, cfg, makeDeps({ outdatedQueue: ['a 1.0 2.0\nb 1.0 2.0'] }));
    await mgr.listOutdated();
    const line = traceSince(before).find(m => m.includes('foo: scan'));
    expect(line).toContain('cmd="foo outdated"');
    expect(line).toContain('→ pendientes=2');
    expect(line).toMatch(/\(\d+ms\)/);
  });

  it('un listado que falla NO devuelve lista vacía: no se puede determinar', async () => {
    const before = getLogEntries().length;
    const deps: ExecDeps = {
      async execCommand(_cmd, args) {
        if (args.includes('--version')) return ran('1.0.0');
        return ran('', 2);
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    };
    const mgr = fromDescriptor(fooDescriptor, cfg, deps);
    // Una lista vacía es una respuesta legítima —«nada pendiente»— así que un
    // fallo no puede devolverla: eso ES la confusión que la fase saca.
    await expect(mgr.listOutdated()).rejects.toThrow(ListingUnavailableError);
    const line = traceSince(before).find(m => m.includes('foo: scan'));
    expect(line).toContain('exit=2');
    expect(line).toContain('→ indeterminado');
  });

  it('un descriptor sin comando de listado lo dice, en vez de no dejar rastro', async () => {
    const before = getLogEntries().length;
    // A read-only descriptor simply declares no listing command.
    const readonlyDescriptor: ManagerDescriptor = { ...fooDescriptor };
    delete readonlyDescriptor.listOutdatedCmd;
    const mgr = fromDescriptor(readonlyDescriptor, cfg, makeDeps({ outdatedQueue: [] }));
    expect(await mgr.listOutdated()).toEqual([]);
    expect(traceSince(before).find(m => m.includes('foo: scan'))).toContain('(sin comando de listado)');
  });

  it('un upgrade cuya verificación no se puede tomar es indeterminado, no éxito', async () => {
    let listCalls = 0;
    const mgr = fromDescriptor(fooDescriptor, cfg, {
      async execCommand(_cmd, args) {
        if (args.includes('--version')) return ran('1.0.0');
        // La foto previa sale bien; la posterior falla.
        listCalls += 1;
        return listCalls === 1 ? ran('a 1.0 2.0') : ran('', 2);
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    });
    const { result } = await drain(mgr.upgrade(['a']));
    expect(result.status).toBe('unknown');
    expect(result.success).toBe(false);
    expect(result.upgraded).toBe(0);
  });

  it('sin foto previa y sin paquetes pedidos, no hay nada que afirmar', async () => {
    const mgr = fromDescriptor(fooDescriptor, cfg, {
      async execCommand(_cmd, args) {
        if (args.includes('--version')) return ran('1.0.0');
        return ran('', 2);
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    });
    const { result } = await drain(mgr.upgrade());
    expect(result.status).toBe('unknown');
    expect(result.errors[0]).toContain('no se pudo determinar la lista de pendientes');
  });
});
