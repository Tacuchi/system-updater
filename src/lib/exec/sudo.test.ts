import { describe, it, expect } from 'vitest';
import { classifySudoProbe } from './sudo.js';

describe('classifySudoProbe', () => {
  it('reports available on exit 0', () => {
    expect(classifySudoProbe({ exitCode: 0, stderrTail: '' })).toBe('available');
  });

  it('reports needs-password when sudo asks for a password', () => {
    expect(classifySudoProbe({ exitCode: 1, stderrTail: 'sudo: a password is required' })).toBe('needs-password');
  });

  it('reports no-sudo when the sudo binary is missing', () => {
    expect(classifySudoProbe({ exitCode: null, stderrTail: 'spawn sudo ENOENT' })).toBe('no-sudo');
    expect(classifySudoProbe({ exitCode: 127, stderrTail: 'sudo: command not found' })).toBe('no-sudo');
  });

  it('defaults a generic non-zero exit to needs-password', () => {
    expect(classifySudoProbe({ exitCode: 1, stderrTail: 'some policy error' })).toBe('needs-password');
  });
});
