import { describe, it, expect } from 'vitest';
import { runExec, runStream } from './run.js';
import type { ProgressEvent } from '../../managers/types.js';

const NODE = process.execPath;
const opts = { timeoutMs: 5000, sudo: false };

describe('runExec', () => {
  it('captures stdout and a zero exit code', async () => {
    const rec = await runExec(NODE, ['-e', "process.stdout.write('hello')"], opts);
    expect(rec.exitCode).toBe(0);
    expect(rec.stdoutTail).toContain('hello');
    expect(rec.timedOut).toBe(false);
    expect(rec.cmd).toContain('-e');
  });

  it('captures stderr and a non-zero exit code', async () => {
    const rec = await runExec(NODE, ['-e', "process.stderr.write('boom'); process.exit(3)"], opts);
    expect(rec.exitCode).toBe(3);
    expect(rec.stderrTail).toContain('boom');
  });

  it('flags a timeout', async () => {
    const rec = await runExec(NODE, ['-e', 'setTimeout(()=>{}, 10000)'], { timeoutMs: 150, sudo: false });
    expect(rec.timedOut).toBe(true);
  });

  it('truncates output to the tail', async () => {
    const rec = await runExec(
      NODE,
      ['-e', "process.stdout.write('x'.repeat(1000))"],
      { timeoutMs: 5000, sudo: false, tailBytes: 100 },
    );
    expect(rec.stdoutTail.length).toBe(100);
  });
});

describe('runStream', () => {
  it('yields a log event per line and returns the command record', async () => {
    const events: ProgressEvent[] = [];
    const gen = runStream(NODE, ['-e', "console.log('line1'); console.log('line2')"], opts);
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }
    const rec = next.value;
    expect(events.map(e => e.message)).toEqual(expect.arrayContaining(['line1', 'line2']));
    expect(rec.exitCode).toBe(0);
  });

  it('emits percent when a parser matches a line', async () => {
    const events: ProgressEvent[] = [];
    const gen = runStream(
      NODE,
      ['-e', "console.log('progress 42%')"],
      opts,
      line => {
        const m = line.match(/(\d+)%/);
        return m ? Number(m[1]) : undefined;
      },
    );
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }
    expect(events.some(e => e.percent === 42)).toBe(true);
  });
});
