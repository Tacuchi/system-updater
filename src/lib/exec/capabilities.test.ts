import { describe, it, expect } from 'vitest';
import { once, resetCapabilities } from './capabilities.js';

describe('once', () => {
  it('runs the function only once per key and caches the result', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return 'value';
    };
    const a = await once('k1', fn);
    const b = await once('k1', fn);

    expect(a).toBe('value');
    expect(b).toBe('value');
    expect(calls).toBe(1);
  });

  it('isolates different keys', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    const a = await once('a', fn);
    const b = await once('b', fn);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('dedupes concurrent calls for the same key (single in-flight promise)', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise(r => setTimeout(r, 5));
      return calls;
    };
    const [a, b] = await Promise.all([once('concurrent', fn), once('concurrent', fn)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });

  it('can be reset (test seam)', async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await once('reset-me', fn);
    resetCapabilities();
    await once('reset-me', fn);
    expect(calls).toBe(2);
  });
});
