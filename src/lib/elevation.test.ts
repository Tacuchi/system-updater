import { describe, it, expect, vi, afterEach } from 'vitest';

const isAdminMock = vi.hoisted(() => vi.fn());
const execaMock = vi.hoisted(() => vi.fn());
vi.mock('is-admin', () => ({ default: () => isAdminMock() }));
vi.mock('execa', () => ({ execa: (...args: unknown[]) => execaMock(...args) }));

import { isElevated, relaunchElevated, elevatedSummaryPath } from './elevation.js';

const realPlatform = process.platform;
const setPlatform = (p: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: p, configurable: true });

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  isAdminMock.mockReset();
  execaMock.mockReset();
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

describe('relaunchElevated', () => {
  it('is a no-op off Windows (never spawns)', async () => {
    setPlatform('darwin');
    expect(await relaunchElevated()).toBe(false);
    expect(execaMock).not.toHaveBeenCalled();
  });

  it('on win32 invokes PowerShell Start-Process -Verb RunAs and reports success', async () => {
    setPlatform('win32');
    execaMock.mockResolvedValue({ exitCode: 0 });
    expect(await relaunchElevated()).toBe(true);
    const [bin, psArgs] = execaMock.mock.calls[0] as [string, string[]];
    expect(bin).toBe('powershell.exe');
    const command = psArgs[psArgs.length - 1];
    expect(command).toContain('Start-Process');
    expect(command).toContain('-Verb RunAs');
  });

  it('on win32 returns false when the relaunch exits non-zero (UAC declined)', async () => {
    setPlatform('win32');
    execaMock.mockResolvedValue({ exitCode: 1 });
    expect(await relaunchElevated()).toBe(false);
  });
});

describe('elevatedSummaryPath', () => {
  it('points at a per-app file', () => {
    const p = elevatedSummaryPath();
    expect(p).toContain('tacuchi-updater');
    expect(p).toContain('last-run-summary.json');
  });
});
