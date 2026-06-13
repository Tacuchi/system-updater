import { describe, it, expect } from 'vitest';
import { parseWingetOutdated } from './winget.js';

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
