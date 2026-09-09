import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePipOutdated, pipInvocation, pipCmd, pip } from './pip.js';
import { resetCapabilities } from '../../lib/exec/capabilities.js';
import { ListingUnavailableError } from '../listing.js';

// Fake machine with a SPLIT-BRAIN pip: the `pip3` shim resolves to one
// interpreter (clean) while `python3 -m pip` resolves to another that IS
// PEP 668 externally-managed — the real-world macOS case (miniconda shim in
// ~/.local/bin vs Homebrew python3) behind the "every run fails" logs.
const h = vi.hoisted(() => ({
  calls: [] as { cmd: string; args: string[] }[],
  upgrades: [] as { cmd: string; args: string[] }[],
  world: { pythonOk: true, moduleManaged: true, shimManaged: false, listExit: 0 },
}));

vi.mock('../../lib/executor.js', () => ({
  execCommand: async (cmd: string, args: string[]) => {
    h.calls.push({ cmd, args });
    const line = [cmd, ...args].join(' ');
    const isModule = args[0] === '-m' && args[1] === 'pip';
    if (line.endsWith('-m pip --version')) {
      return h.world.pythonOk && cmd === 'python3'
        ? { exitCode: 0, stdout: 'pip 26.1 (python 3.14)', stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'no module named pip' };
    }
    if (line.includes('install --user --dry-run pip')) {
      const managed = isModule ? h.world.moduleManaged : h.world.shimManaged;
      return managed
        ? { exitCode: 1, stdout: '', stderr: 'error: externally-managed-environment' }
        : { exitCode: 0, stdout: 'Would install pip', stderr: '' };
    }
    if (line.includes('list --outdated')) {
      return { exitCode: h.world.listExit, stdout: h.world.listExit === 0 ? '[]' : '', stderr: 'boom', timedOut: false, spawnFailed: false };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  },
}));

vi.mock('../../lib/exec/run.js', () => ({
  runStream: async function* (cmd: string, args: string[]) {
    h.upgrades.push({ cmd, args });
    return { cmd: [cmd, ...args].join(' '), exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
  },
}));

async function runUpgrade(packages: string[]) {
  const gen = pip.escapeHatch!.upgrade!(packages, { platform: 'darwin', sudoMode: false, meta: {} });
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return next.value;
}

describe('parsePipOutdated', () => {
  it('parses pip list --outdated --format=json', () => {
    const json = JSON.stringify([
      { name: 'requests', version: '2.28.0', latest_version: '2.31.0' },
      { name: 'numpy', version: '1.24.0', latest_version: '1.26.0' },
    ]);
    expect(parsePipOutdated(json)).toEqual([
      { name: 'requests', currentVersion: '2.28.0', newVersion: '2.31.0' },
      { name: 'numpy', currentVersion: '1.24.0', newVersion: '1.26.0' },
    ]);
  });

  it('returns [] on invalid json', () => {
    expect(parsePipOutdated('boom')).toEqual([]);
  });
});

describe('pip invocation coherence (list + PEP 668 probe + upgrade = ONE interpreter)', () => {
  beforeEach(() => {
    resetCapabilities();
    h.calls.length = 0;
    h.upgrades.length = 0;
    h.world.pythonOk = true;
    h.world.moduleManaged = true;
    h.world.shimManaged = false;
    h.world.listExit = 0;
  });

  it('applies --break-system-packages when the UPGRADE interpreter is managed, even if the shim is not', async () => {
    // Regression: the probe used to ask the `pip3` shim (clean) while the
    // upgrade ran `python3 -m pip` (managed) → flag omitted → every run failed.
    await runUpgrade(['click']);
    expect(h.upgrades).toHaveLength(1);
    expect(h.upgrades[0]!.cmd).toBe('python3');
    expect(h.upgrades[0]!.args.slice(0, 2)).toEqual(['-m', 'pip']);
    expect(h.upgrades[0]!.args).toContain('--break-system-packages');
    expect(h.upgrades[0]!.args).toContain('click');
  });

  it('never mixes the shim in: probe and list also go through the resolved python', async () => {
    await runUpgrade(['click']);
    const shimCalls = h.calls.filter(c => c.cmd === pipCmd());
    expect(shimCalls).toEqual([]);
  });

  it('falls back to the shim for EVERYTHING when no python resolves (still coherent)', async () => {
    h.world.pythonOk = false;
    h.world.shimManaged = true;
    await runUpgrade(['click']);
    expect(h.upgrades).toHaveLength(1);
    expect(h.upgrades[0]!.cmd).toBe(pipCmd());
    expect(h.upgrades[0]!.args).not.toContain('-m');
    expect(h.upgrades[0]!.args).toContain('--break-system-packages');
  });
});

describe('pipInvocation', () => {
  it('runs pip as a module when a Python interpreter is resolved (avoids the shim self-upgrade refusal)', () => {
    expect(pipInvocation('python')).toEqual({ cmd: 'python', baseArgs: ['-m', 'pip'] });
    expect(pipInvocation('py')).toEqual({ cmd: 'py', baseArgs: ['-m', 'pip'] });
  });

  it('falls back to the bare pip shim with no extra args when no interpreter is found', () => {
    expect(pipInvocation(null)).toEqual({ cmd: pipCmd(), baseArgs: [] });
  });
});

describe('el listado de pip que falla no se lee como «todo al día»', () => {
  beforeEach(() => {
    resetCapabilities();
    h.world.pythonOk = true;
    h.world.moduleManaged = true;
    h.world.shimManaged = false;
    h.world.listExit = 0;
  });

  it('devuelve la lista cuando el comando contesta', async () => {
    const list = await pip.escapeHatch!.listOutdated!({ platform: 'darwin', sudoMode: false, meta: {} });
    expect(list).toEqual([]);
  });

  it('un listado que sale distinto de cero NO devuelve lista vacía', async () => {
    // La forma exacta del defecto de origen: pip fallaba el 100% de las corridas
    // y la pantalla decía «al día» porque una lista vacía es una respuesta válida.
    h.world.listExit = 1;
    await expect(
      pip.escapeHatch!.listOutdated!({ platform: 'darwin', sudoMode: false, meta: {} }),
    ).rejects.toThrow(ListingUnavailableError);
  });
});
