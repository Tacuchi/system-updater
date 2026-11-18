import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('terminal design reference', () => {
  it('documents only implemented tokens and glyphs', () => {
    const design = readFileSync('docs/DESIGN.md', 'utf8');
    const source = readFileSync('src/theme.ts', 'utf8') + readFileSync('src/lib/glyphs.ts', 'utf8');
    const colors = design.match(/#[a-f\d]{6}\b/gi) ?? [];
    expect(colors.length).toBeGreaterThanOrEqual(9);
    for (const color of colors) expect(source).toContain(color);
    for (const line of design.split('\n').filter(line => line.startsWith('|'))) {
      const cells = line.split('|');
      for (const cell of [cells[2] ?? '', cells[3] ?? '']) {
        for (const match of cell.matchAll(/`([^`]+)`/g)) expect(source).toContain(`'${match[1]}'`);
      }
    }
    for (const match of design.matchAll(/`([^`\n]+)`/g)) {
      if (/[^\x00-\x7f]/.test(match[1]!)) expect(source).toContain(`'${match[1]}'`);
    }
    expect(design).not.toMatch(/desenfoque|\bpx\b|familia tipográfica|barra de progreso|panel de log/i);
    expect(design).toContain('NO_COLOR');
    expect(design).toContain('60');
    expect(design).toContain('tacuchi_');
  });
});
