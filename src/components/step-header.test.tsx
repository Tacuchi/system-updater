import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { StepHeader } from './step-header.js';
import { MachineProvider } from '../hooks/use-app-machine.js';
import { configureBanner, type BannerImage } from '../lib/banner.js';
import { MARK_ART } from '../lib/brand-mark.js';
import { IMAGE_COLUMN, MARK_COLUMNS, MARK_ROWS, placeholderRows } from '../lib/terminal-image.js';
import { setTerminalTheme, tokens } from '../theme.js';

const level = chalk.level;
const noColor = process.env['NO_COLOR'];
const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
const rows = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
afterEach(() => {
  chalk.level = level;
  if (noColor === undefined) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = noColor;
  if (columns) Object.defineProperty(process.stdout, 'columns', columns); else Reflect.deleteProperty(process.stdout, 'columns');
  if (rows) Object.defineProperty(process.stdout, 'rows', rows); else Reflect.deleteProperty(process.stdout, 'rows');
  configureBanner(null);
  setTerminalTheme('dark');
});

const value = {
  state: { phase: 'select', order: ['brew'], error: null },
  selfUpdate: null,
} as unknown as React.ComponentProps<typeof MachineProvider>['value'];

function header(banner: BannerImage, color = true): string[] {
  Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 100 });
  Object.defineProperty(process.stdout, 'rows', { configurable: true, value: 30 });
  if (color) delete process.env['NO_COLOR']; else process.env['NO_COLOR'] = '1';
  chalk.level = color ? 3 : 0;
  configureBanner(banner);
  const { lastFrame, unmount } = render(<MachineProvider value={value}><StepHeader /></MachineProvider>);
  try { return (lastFrame() ?? '').split('\n'); } finally { unmount(); }
}
const truecolor = (hex: string) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`;
const footprint = { id: 0, columns: MARK_COLUMNS, rows: MARK_ROWS };
// Rendered alone, without the screen's one-column padding, the mark starts at IMAGE_COLUMN - 1.
const LEFT = IMAGE_COLUMN - 1;
const cells = (line: string) => stripAnsi(line).slice(LEFT, LEFT + MARK_COLUMNS);

describe('header mark in every form', () => {
  it('draws the blocks art, block cells in the text token and the two lime cells in the accent token', () => {
    const lines = header({ ...footprint, tier: 'blocks' });
    expect(lines.slice(0, 3).map(cells)).toEqual(MARK_ART.blocks);
    expect(lines[0]).toContain(truecolor(tokens.dark.text) + '██████');
    expect(lines[2]).toContain(truecolor(tokens.dark.text) + '███ ');
    expect(lines[2]).toContain(truecolor(tokens.dark.accent) + '▄█');
  });
  it('uses the light tokens on a light terminal', () => {
    setTerminalTheme('light');
    const lines = header({ ...footprint, tier: 'blocks' });
    expect(lines[0]).toContain(truecolor(tokens.light.text) + '██████');
    expect(lines[2]).toContain(truecolor(tokens.light.accent) + '▄█');
  });
  it('draws the ASCII art in the same colours', () => {
    const lines = header({ ...footprint, tier: 'ascii' });
    expect(lines.slice(0, 3).map(cells)).toEqual(MARK_ART.ascii);
    expect(lines[2]).toContain(truecolor(tokens.dark.accent) + '_#');
  });
  it('draws the blocks without any colour under NO_COLOR, the notch still there', () => {
    const lines = header({ ...footprint, tier: 'blocks' }, false);
    expect(lines.join('\n')).not.toMatch(/\x1b\[/);
    expect(lines.slice(0, 3).map(line => line.slice(LEFT, LEFT + MARK_COLUMNS))).toEqual(MARK_ART.blocks);
  });
  it('keeps the 6 x 3 footprint and the text column identical across all forms', () => {
    // A placeholder cell is U+10EEEE (two UTF-16 units) plus two diacritics; every other cell is one unit.
    const text = (lines: string[], unit = 1) => lines.slice(0, 3).map(line => stripAnsi(line).slice(LEFT + MARK_COLUMNS * unit));
    const placeholders = header({ ...footprint, id: 42, tier: 'placeholders' });
    const expected = text(placeholders, 4);
    expect(expected[0]).toMatch(/^ {2}tacuchi updater 3\.\d+\.\d+/);
    for (let row = 0; row < 3; row++) expect(stripAnsi(placeholders[row]!).slice(LEFT, LEFT + MARK_COLUMNS * 4)).toBe(stripAnsi(placeholderRows(42, MARK_COLUMNS, MARK_ROWS)[row]!));
    for (const tier of ['cursor', 'sixel', 'blocks', 'ascii'] as const) {
      const lines = header({ ...footprint, tier });
      expect(text(lines)).toEqual(expected);
      for (const line of lines.slice(0, 3)) expect(stripAnsi(line).startsWith(' '.repeat(LEFT))).toBe(true);
    }
    expect(text(header({ ...footprint, tier: 'blocks' }, false))).toEqual(expected);
  });
});
