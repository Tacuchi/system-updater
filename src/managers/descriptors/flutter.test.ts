import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flutter, parseFlutterVersion, findLatestStable } from './flutter.js';
import { resetCapabilities } from '../../lib/exec/capabilities.js';
import type { OutdatedPackage } from '../types.js';

const { execCommand } = vi.hoisted(() => ({ execCommand: vi.fn() }));
vi.mock('../../lib/executor.js', () => ({ execCommand }));

describe('consulta Flutter que no contesta', () => {
  beforeEach(() => {
    resetCapabilities();
    vi.useFakeTimers();
    execCommand.mockImplementation(async (_cmd: string, args: string[]) => ({
      exitCode: 0,
      stdout: args.includes('--machine')
        ? JSON.stringify({ frameworkVersion: '3.47.4' })
        : 'A new version of Flutter is available',
      stderr: '',
    }));
    // Native AbortSignal timers bypass Vitest's clock; keep the actual abort
    // contract while allowing the ten-second network stall to run instantly.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(delay => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), delay);
      return controller.signal;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetCapabilities();
  });

  it.each(['headers', 'body'])('abandona %s bloqueados y consulta el aviso del SDK', async stage => {
    const stalled = (signal?: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    vi.stubGlobal('fetch', async (_url: string, init?: { signal?: AbortSignal }) => {
      if (stage === 'headers') await stalled(init?.signal);
      return { ok: true, text: () => stalled(init?.signal) };
    });
    let observed: OutdatedPackage[] | undefined;
    void flutter.escapeHatch!.listOutdated!({ platform: 'darwin', sudoMode: false, meta: {} })
      .then(list => { observed = list; });

    await vi.advanceTimersByTimeAsync(10_001);

    expect(observed).toEqual([
      { name: 'flutter-sdk', currentVersion: '3.47.4', newVersion: 'disponible' },
    ]);
  });
});

describe('parseFlutterVersion', () => {
  it('parses frameworkVersion from `flutter --version --machine` JSON', () => {
    const json = JSON.stringify({
      frameworkVersion: '3.19.6',
      channel: 'stable',
      dartSdkVersion: '3.3.4',
    });
    expect(parseFlutterVersion(json)).toBe('3.19.6');
  });

  it('falls back to the text banner when output is not JSON', () => {
    const banner = [
      'Flutter 3.19.6 • channel stable • https://github.com/flutter/flutter.git',
      'Framework • revision abcdef1234 (3 weeks ago) • 2024-04-17 11:27:05 -0500',
      'Engine • revision deadbeef',
      'Tools • Dart 3.3.4 • DevTools 2.31.1',
    ].join('\n');
    expect(parseFlutterVersion(banner)).toBe('3.19.6');
  });

  it('returns undefined when neither JSON nor banner has a version', () => {
    expect(parseFlutterVersion('something unrelated')).toBeUndefined();
  });
});

describe('findLatestStable', () => {
  it('returns the first stable-channel release version', () => {
    const json = JSON.stringify({
      base_url: 'https://storage.googleapis.com/flutter_infra_release/releases',
      current_release: { stable: 'hash-stable', beta: 'hash-beta' },
      releases: [
        { version: '3.20.0', channel: 'stable', hash: 'h1' },
        { version: '3.21.0-1.0.pre', channel: 'beta', hash: 'h2' },
        { version: '3.19.6', channel: 'stable', hash: 'h3' },
      ],
    });
    expect(findLatestStable(json)).toBe('3.20.0');
  });

  it('returns undefined when there is no stable release', () => {
    const json = JSON.stringify({
      releases: [{ version: '3.21.0-1.0.pre', channel: 'beta', hash: 'h2' }],
    });
    expect(findLatestStable(json)).toBeUndefined();
  });

  it('returns undefined on invalid json', () => {
    expect(findLatestStable('boom')).toBeUndefined();
  });
});
