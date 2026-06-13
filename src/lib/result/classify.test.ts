import { describe, it, expect } from 'vitest';
import { classifyCommand } from './classify.js';
import type { CommandRecord } from '../../managers/types.js';

function rec(partial: Partial<CommandRecord>): CommandRecord {
  return {
    cmd: 'x',
    exitCode: 0,
    durationMs: 1,
    timedOut: false,
    stdoutTail: '',
    stderrTail: '',
    ...partial,
  };
}

describe('classifyCommand', () => {
  it('returns null when the command succeeded (exit 0)', () => {
    expect(classifyCommand(rec({ exitCode: 0 }))).toBeNull();
  });

  it('returns null when exit code is in successExitCodes', () => {
    // e.g. `npm outdated` exits 1 even on success
    expect(classifyCommand(rec({ exitCode: 1 }), [1])).toBeNull();
  });

  it('classifies a timeout regardless of exit code', () => {
    expect(classifyCommand(rec({ timedOut: true, exitCode: null }))).toBe('TIMEOUT');
  });

  it('classifies a plain non-zero exit as COMMAND_FAILED', () => {
    expect(classifyCommand(rec({ exitCode: 1, stderrTail: 'something broke' }))).toBe('COMMAND_FAILED');
  });

  it('classifies passwordless-sudo failure from stderr', () => {
    expect(
      classifyCommand(rec({ exitCode: 1, stderrTail: 'sudo: a password is required' })),
    ).toBe('NO_PASSWORDLESS_SUDO');
  });

  it('classifies network failures from stderr', () => {
    expect(
      classifyCommand(rec({ exitCode: 1, stderrTail: 'Could not resolve host: registry.npmjs.org' })),
    ).toBe('NETWORK');
    expect(classifyCommand(rec({ exitCode: 6, stderrTail: 'curl: (6) ENOTFOUND' }))).toBe('NETWORK');
  });

  it('treats a killed process (null exit, no timeout) as COMMAND_FAILED', () => {
    expect(classifyCommand(rec({ exitCode: null, timedOut: false }))).toBe('COMMAND_FAILED');
  });
});
