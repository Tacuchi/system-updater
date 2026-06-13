import { describe, it, expect } from 'vitest';
import { toManagerResult } from './use-app-machine.js';
import type { UpgradeResult } from '../managers/types.js';

describe('toManagerResult', () => {
  it('maps a successful result with no failures', () => {
    const r: UpgradeResult = { success: true, upgraded: 3, failed: 0, errors: [], status: 'success' };
    const m = toManagerResult(r, '/tmp/log');
    expect(m.status).toBe('success');
    expect(m.upgraded).toBe(3);
    expect(m.failures).toHaveLength(0);
  });

  it('extracts per-package failures with the log reference', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 1,
      failed: 1,
      errors: ['numpy: ...'],
      status: 'partial',
      packages: [
        { name: 'requests', outcome: 'upgraded' },
        { name: 'numpy', outcome: 'failed', failureKind: 'COMMAND_FAILED', detail: 'gcc error' },
      ],
    };
    const m = toManagerResult(r, '/tmp/log');
    expect(m.status).toBe('partial');
    expect(m.failures).toHaveLength(1);
    expect(m.failures[0]).toMatchObject({ package: 'numpy', kind: 'COMMAND_FAILED', logRef: '/tmp/log' });
  });

  it('synthesizes a failure entry when none are attributed but the run failed', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 0,
      failed: 1,
      errors: ['boom'],
      status: 'failed',
      reason: 'TIMEOUT',
    };
    const m = toManagerResult(r);
    expect(m.failures).toHaveLength(1);
    expect(m.failures[0]?.kind).toBe('TIMEOUT');
  });

  it('keeps the manual command for a noop (skipped) result', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 0,
      failed: 0,
      errors: [],
      status: 'noop',
      manualCommand: 'sudo apt upgrade',
    };
    const m = toManagerResult(r);
    expect(m.manualCommand).toBe('sudo apt upgrade');
    expect(m.failures).toHaveLength(0);
  });
});
