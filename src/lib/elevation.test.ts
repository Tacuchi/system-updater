import { describe, it, expect, vi, afterEach } from 'vitest';

const isAdminMock = vi.hoisted(() => vi.fn());
vi.mock('is-admin', () => ({ default: () => isAdminMock() }));

import { isElevated } from './elevation.js';

const realPlatform = process.platform;
const setPlatform = (p: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: p, configurable: true });

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  isAdminMock.mockReset();
});

describe('isElevated', () => {
  it('on unix reflects getuid() === 0 (no is-admin call)', async () => {
    setPlatform('linux');
    const expected = process.getuid?.() === 0;
    expect(await isElevated()).toBe(expected);
    expect(isAdminMock).not.toHaveBeenCalled();
  });

  it('on win32 returns the is-admin result (elevated)', async () => {
    setPlatform('win32');
    isAdminMock.mockResolvedValue(true);
    expect(await isElevated()).toBe(true);
  });

  it('on win32 returns the is-admin result (not elevated)', async () => {
    setPlatform('win32');
    isAdminMock.mockResolvedValue(false);
    expect(await isElevated()).toBe(false);
  });

  it('on win32 treats an is-admin error as not elevated', async () => {
    setPlatform('win32');
    isAdminMock.mockRejectedValue(new Error('probe failed'));
    expect(await isElevated()).toBe(false);
  });
});
