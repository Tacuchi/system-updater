import { describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { commandsFor, dispatchKey, hintLines } from './keys.js';
describe('screen key contract', () => {
  it('advertises every bound key and invokes only the active actions', () => {
    setLanguage('es');
    for (const action of ['quit', 'retry', 'down', 'up', 'mark', 'all', 'none', 'next', 'settings', 'back', 'detail', 'language', 'elevate', 'start', 'cancel'] as const) {
      let calls = 0;
      const commands = commandsFor({ [action]: () => { calls++; } });
      expect(commands).toHaveLength(1);
      expect(commands[0]!.label.length).toBeGreaterThan(0);
      for (const key of commands[0]!.keys) {
        dispatchKey(commands, key);
        expect(calls).toBeGreaterThan(0);
        expect(commands[0]!.label).toContain(key === 'return' ? 'Enter' : key === 'escape' ? 'Esc' : key === ' ' ? 'Espacio' : key.length === 1 ? key.toUpperCase() : key === 'downArrow' ? 'J' : 'K');
      }
      const before = calls;
      dispatchKey(commands, '?');
      expect(calls).toBe(before);
    }
  });
  it('wraps complete hints at sixty columns', () => {
    const commands = commandsFor({ quit() {}, down() {}, up() {}, mark() {}, all() {}, none() {}, next() {}, settings() {} });
    const lines = hintLines(commands, 56);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(line => line.length <= 56)).toBe(true);
    for (const command of commands) expect(lines.join('\n')).toContain(command.label);
  });
});
