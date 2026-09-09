import { describe, it, expect } from 'vitest';
import { fromDescriptor } from './engine.js';
import type { ExecDeps } from './engine.js';
import type { ManagerDescriptor } from './descriptor.js';
import type { CommandRecord, OutdatedPackage, ProgressEvent, UpgradeResult } from './types.js';
import { normalizeConfig } from '../lib/config.js';
import { getLogEntries } from '../lib/logger.js';

const cfg = normalizeConfig({});

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
      if (args.includes('--version')) return { stdout: o.version ?? '1.0.0', stderr: '', exitCode: 0 };
      if (args.includes('outdated')) return { stdout: o.outdatedQueue[idx++] ?? '', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
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
        return { stdout: '', stderr: '', exitCode: 0 };
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

  it('un sondeo que falla se registra como ausente, no en silencio', async () => {
    const before = getLogEntries().length;
    const deps: ExecDeps = {
      async execCommand() {
        return { stdout: '', stderr: 'not found', exitCode: 127 };
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    };
    const mgr = fromDescriptor(fooDescriptor, cfg, deps);
    expect(await mgr.detect()).toEqual({ available: false });
    const line = traceSince(before).find(m => m.includes('foo: detect'));
    expect(line).toContain('exit=127');
    expect(line).toContain('→ ausente');
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

  it('un listado que falla queda marcado como fallido y no como cero pendientes', async () => {
    const before = getLogEntries().length;
    const deps: ExecDeps = {
      async execCommand(_cmd, args) {
        if (args.includes('--version')) return { stdout: '1.0.0', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: 'boom', exitCode: 2 };
      },
      async *runStream(cmd, args): AsyncGenerator<ProgressEvent, CommandRecord> {
        return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
      },
    };
    const mgr = fromDescriptor(fooDescriptor, cfg, deps);
    expect(await mgr.listOutdated()).toEqual([]);
    const line = traceSince(before).find(m => m.includes('foo: scan'));
    expect(line).toContain('exit=2');
    expect(line).toContain('→ listado fallido');
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
});
