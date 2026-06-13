import { describe, it, expect } from 'vitest';
import { logCommand, logResult, getLogEntries } from './logger.js';
import type { CommandRecord, UpgradeResult } from '../managers/types.js';

describe('logCommand', () => {
  it('records the executed command in the in-memory buffer', () => {
    const before = getLogEntries().length;
    const rec: CommandRecord = {
      cmd: 'brew upgrade git',
      exitCode: 0,
      durationMs: 12,
      timedOut: false,
      stdoutTail: 'ok',
      stderrTail: '',
    };
    logCommand(rec);
    const entries = getLogEntries();
    expect(entries.length).toBe(before + 1);
    expect(entries[entries.length - 1]?.message).toContain('brew upgrade git');
  });
});

describe('logResult', () => {
  it('records a summary entry tagged with the manager id', () => {
    const r: UpgradeResult = {
      success: false,
      upgraded: 1,
      failed: 2,
      errors: ['numpy: no se pudo actualizar (COMMAND_FAILED)'],
      managerId: 'pip',
      status: 'partial',
      reason: 'PARTIAL',
    };
    logResult(r);
    const last = getLogEntries().at(-1);
    expect(last?.message).toContain('pip');
    expect(last?.level).toBe('warn');
  });
});
