import { describe, it, expect } from 'vitest';
import { reconcile } from './verify.js';
import type { CommandRecord, OutdatedPackage, VerifySnapshot } from '../../managers/types.js';

function out(name: string, cur = '1.0.0', next = '2.0.0'): OutdatedPackage {
  return { name, currentVersion: cur, newVersion: next };
}
function cmd(p: Partial<CommandRecord>): CommandRecord {
  return { cmd: 'x', exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '', ...p };
}
const okCmd = cmd({ exitCode: 0 });

describe('reconcile', () => {
  it('marks every package upgraded when none remain outdated', () => {
    const before = [out('a'), out('b')];
    const after: VerifySnapshot = { stillOutdated: [] };
    const r = reconcile(undefined, before, after, [okCmd]);

    expect(r.status).toBe('success');
    expect(r.success).toBe(true);
    expect(r.upgraded).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.packages?.every(p => p.outcome === 'upgraded')).toBe(true);
    expect(r.packages?.find(p => p.name === 'a')?.toVersion).toBe('2.0.0');
  });

  it('marks all failed when packages are still outdated and the command failed', () => {
    const before = [out('a'), out('b')];
    const after: VerifySnapshot = { stillOutdated: [{ name: 'a' }, { name: 'b' }] };
    const r = reconcile(undefined, before, after, [cmd({ exitCode: 1, stderrTail: 'boom' })]);

    expect(r.status).toBe('failed');
    expect(r.success).toBe(false);
    expect(r.upgraded).toBe(0);
    expect(r.failed).toBe(2);
    expect(r.reason).toBe('COMMAND_FAILED');
    expect(r.packages?.every(p => p.outcome === 'failed' && p.failureKind === 'COMMAND_FAILED')).toBe(true);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('reports partial when some upgraded and some did not', () => {
    const before = [out('a'), out('b'), out('c')];
    const after: VerifySnapshot = { stillOutdated: [{ name: 'b' }] };
    const r = reconcile(undefined, before, after, [okCmd]);

    expect(r.status).toBe('partial');
    expect(r.success).toBe(false);
    expect(r.upgraded).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.reason).toBe('PARTIAL');
  });

  it('only considers the requested subset (ignores other still-outdated packages)', () => {
    const before = [out('a'), out('b'), out('c')];
    const after: VerifySnapshot = { stillOutdated: [{ name: 'c' }] }; // c not requested
    const r = reconcile(['a', 'b'], before, after, [okCmd]);

    expect(r.status).toBe('success');
    expect(r.upgraded).toBe(2);
    expect(r.failed).toBe(0);
  });

  it('is a noop when there is nothing to upgrade', () => {
    const r = reconcile(undefined, [], { stillOutdated: [] }, []);
    expect(r.status).toBe('noop');
    expect(r.success).toBe(true);
    expect(r.upgraded).toBe(0);
    expect(r.failed).toBe(0);
  });

  it('attributes the failure kind from the commands (timeout)', () => {
    const before = [out('a')];
    const after: VerifySnapshot = { stillOutdated: [{ name: 'a' }] };
    const r = reconcile(undefined, before, after, [cmd({ exitCode: null, timedOut: true })]);

    expect(r.status).toBe('failed');
    expect(r.reason).toBe('TIMEOUT');
    expect(r.packages?.[0]?.failureKind).toBe('TIMEOUT');
  });

  it('carries the command records through for diagnosis', () => {
    const cmds = [cmd({ cmd: 'brew upgrade a' })];
    const r = reconcile(['a'], [out('a')], { stillOutdated: [] }, cmds);
    expect(r.commands).toEqual(cmds);
  });

  it('flags a pending reboot from a choco exit code without failing the run', () => {
    // 3010 is a success code (passed via successExitCodes) AND signals reboot-required.
    const r = reconcile(undefined, [out('vscode')], { stillOutdated: [] }, [cmd({ exitCode: 3010 })], [0, 3010]);
    expect(r.status).toBe('success');
    expect(r.upgraded).toBe(1);
    expect(r.reboot).toBe('required');
  });

  it('maps the reboot exit codes (1641 initiated, 350 deferred)', () => {
    const before = [out('x')];
    const ok: VerifySnapshot = { stillOutdated: [] };
    expect(reconcile(undefined, before, ok, [cmd({ exitCode: 1641 })], [0, 1641]).reboot).toBe('initiated');
    expect(reconcile(undefined, before, ok, [cmd({ exitCode: 350 })], [0, 350]).reboot).toBe('deferred');
  });

  it('has no reboot for a clean exit', () => {
    const r = reconcile(undefined, [out('a')], { stillOutdated: [] }, [okCmd]);
    expect(r.reboot).toBeUndefined();
  });
});
