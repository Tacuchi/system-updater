import { describe, it, expect, vi, beforeEach } from 'vitest';

const treeKillMock = vi.hoisted(() => vi.fn());
vi.mock('tree-kill', () => ({ default: (...args: unknown[]) => treeKillMock(...args) }));

import { killTree } from './kill-tree.js';

beforeEach(() => treeKillMock.mockReset());

describe('killTree', () => {
  it('does nothing for an undefined pid', () => {
    killTree(undefined);
    expect(treeKillMock).not.toHaveBeenCalled();
  });

  it('forwards pid + signal to tree-kill', () => {
    killTree(4321, 'SIGKILL');
    expect(treeKillMock).toHaveBeenCalledWith(4321, 'SIGKILL', expect.any(Function));
  });

  it('defaults to SIGTERM', () => {
    killTree(10);
    expect(treeKillMock).toHaveBeenCalledWith(10, 'SIGTERM', expect.any(Function));
  });

  it('swallows a throwing tree-kill', () => {
    treeKillMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => killTree(7)).not.toThrow();
  });
});
