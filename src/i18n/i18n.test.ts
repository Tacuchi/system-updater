import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { es } from './es.js';
import { en } from './en.js';
function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [prefix + key] : keys(item, prefix + key + '.'));
}
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) && !path.includes('.test.') && !path.includes('/i18n/') ? [path] : [];
  });
}
describe('translation contract', () => {
  it('keeps locale keys in parity and every section consumed', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
    const source = sourceFiles('src').map(file => readFileSync(file, 'utf8')).join('\n');
    for (const section of Object.keys(es)) {
      expect(source.includes(`'${section}'`) || ['managers', 'hints'].includes(section)).toBe(true);
    }
    for (const key of Object.keys(es.ui)) expect(source, `unused ui.${key}`).toContain(`'${key}'`);
    expect(keys(es).length).toBeGreaterThan(50);
  });
  it('localizes help and sudo messages in both languages', () => {
    expect(en.cli.help).toContain('Usage:');
    expect(en.cli.help).not.toMatch(/Uso|gestores|versión/);
    expect(es.cli.help).toContain('Uso:');
    expect(es.cli.help).not.toMatch(/Usage|package managers/);
    expect(en.cli.sudoPrompt).toContain('password');
    expect(es.cli.sudoPrompt).toContain('contraseña');
  });
  it('aligns all four help descriptions after the longest option', () => {
    for (const locale of [es, en]) {
      const lines = locale.cli.help.split('\n').filter(line => /^-[syhv],/.test(line));
      expect(lines).toHaveLength(4);
      const columns = lines.map(line => {
        const match = line.match(/^(-[a-z], --[a-z]+(?:, --[a-z]+)?) +(\S.*)$/)!;
        expect(match).not.toBeNull();
        expect(line.indexOf(match[2]!) - match[1]!.length).toBeGreaterThanOrEqual(2);
        return line.indexOf(match[2]!);
      });
      expect(new Set(columns).size).toBe(1);
    }
  });
});
