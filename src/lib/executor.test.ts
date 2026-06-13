import { describe, it, expect } from 'vitest';
import { execCommand } from './executor.js';

const NODE = process.execPath;

describe('execCommand', () => {
  it('returns a non-zero exit code when the binary does not exist', async () => {
    // Regression: execa v9 + reject:false resolves a missing binary with
    // exitCode undefined; coercing that to 0 made every absent manager look
    // "detected". A missing binary must read as a failure.
    const r = await execCommand('definitely_not_a_real_cmd_xyz', ['--version'], 3000);
    expect(r.exitCode).not.toBe(0);
  });

  it('returns exit 0 for a command that succeeds', async () => {
    const r = await execCommand(NODE, ['-e', 'process.exit(0)'], 3000);
    expect(r.exitCode).toBe(0);
  });

  it('preserves a real non-zero exit code', async () => {
    const r = await execCommand(NODE, ['-e', 'process.exit(3)'], 3000);
    expect(r.exitCode).toBe(3);
  });
});
