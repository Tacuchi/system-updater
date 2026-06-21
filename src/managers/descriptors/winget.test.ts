import { describe, it, expect, vi } from 'vitest';
import { parseWingetOutdated, winget } from './winget.js';
import type { ManagerCtx } from '../descriptor.js';

// Mock the spawn surface so the escape-hatch upgrade loop runs without a real
// `winget` binary (it's win32-only and absent on the dev/CI mac).
vi.mock('../../lib/exec/run.js', () => ({
  runStream: async function* () {
    return { cmd: 'winget', exitCode: 0, durationMs: 1, timedOut: false, stdoutTail: '', stderrTail: '' };
  },
}));
vi.mock('../../lib/executor.js', () => ({
  execCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
}));

// Build a fixed-width row so the header and data columns start at the SAME
// offsets — exactly how real winget pads its table.
const WIDTHS = [32, 28, 15, 15]; // Name, Id, Version, Available (Source = remainder)
const row = (...cells: string[]) =>
  cells.map((c, i) => (i < WIDTHS.length ? c.padEnd(WIDTHS[i]!) : c)).join('');
const dashes = '-'.repeat(95);

describe('parseWingetOutdated', () => {
  it('parses by column offset — Id is the Id, never the version (Spanish header, spaced Name)', () => {
    // Regression: the old whitespace split treated the Version as the Id, so
    // `winget upgrade --id 149.0.4022.62` (a version!) failed.
    const stdout = [
      row('Nombre', 'Id', 'Versión', 'Disponible', 'Origen'),
      dashes,
      row('Microsoft Edge', 'Microsoft.Edge', '148.0.0.0', '149.0.4022.62', 'winget'),
      row('Git', 'Git.Git', '2.43.0', '2.44.0', 'winget'),
    ].join('\n');

    expect(parseWingetOutdated(stdout)).toEqual([
      { name: 'Microsoft.Edge', currentVersion: '148.0.0.0', newVersion: '149.0.4022.62' },
      { name: 'Git.Git', currentVersion: '2.43.0', newVersion: '2.44.0' },
    ]);
  });

  it('parses the English header too', () => {
    const stdout = [
      row('Name', 'Id', 'Version', 'Available', 'Source'),
      dashes,
      row('7-Zip 24', '7zip.7zip', '23.01', '24.00', 'winget'),
    ].join('\n');
    expect(parseWingetOutdated(stdout)).toEqual([
      { name: '7zip.7zip', currentVersion: '23.01', newVersion: '24.00' },
    ]);
  });

  it('strips the progress spinner and the trailing summary line', () => {
    const stdout = [
      '  \\\r  -\r   ', // spinner noise overwritten via carriage returns
      row('Nombre', 'Id', 'Versión', 'Disponible', 'Origen'),
      dashes,
      row('Mozilla Firefox', 'Mozilla.Firefox', '120.0', '125.0', 'winget'),
      '',
      '1 actualizaciones disponibles.',
    ].join('\n');
    expect(parseWingetOutdated(stdout)).toEqual([
      { name: 'Mozilla.Firefox', currentVersion: '120.0', newVersion: '125.0' },
    ]);
  });

  it('returns [] when there is no table', () => {
    expect(parseWingetOutdated('')).toEqual([]);
    expect(parseWingetOutdated('No se encontró ningún paquete que coincida.')).toEqual([]);
  });
});

describe('winget upgrade progress (loop index → percent)', () => {
  const ctx: ManagerCtx = { platform: 'win32', sudoMode: false, meta: {} };

  async function drainPercents(packages: string[]): Promise<number[]> {
    const gen = winget.escapeHatch!.upgrade!(packages, ctx);
    const percents: number[] = [];
    let next = await gen.next();
    while (!next.done) {
      if (next.value.type === 'progress' && next.value.percent !== undefined) percents.push(next.value.percent);
      next = await gen.next();
    }
    return percents;
  }

  it('emits a real percent after each package completes', async () => {
    expect(await drainPercents(['A', 'B'])).toEqual([50, 100]);
  });

  it('emits 100% for a single selected package', async () => {
    expect(await drainPercents(['OnlyOne'])).toEqual([100]);
  });
});
