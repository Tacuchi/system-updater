import { describe, it, expect, vi } from 'vitest';
import { onProcessCancel, fireProcessCancel } from './cancellation.js';

describe('cancellation registry', () => {
  it('fires every registered handler', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onProcessCancel(a);
    const offB = onProcessCancel(b);
    fireProcessCancel();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it('stops calling a handler after it unregisters', () => {
    const a = vi.fn();
    const off = onProcessCancel(a);
    off();
    fireProcessCancel();
    expect(a).not.toHaveBeenCalled();
  });

  it('keeps firing the rest when one handler throws', () => {
    const bad = vi.fn(() => {
      throw new Error('x');
    });
    const good = vi.fn();
    const offBad = onProcessCancel(bad);
    const offGood = onProcessCancel(good);
    expect(() => fireProcessCancel()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
  });
});
