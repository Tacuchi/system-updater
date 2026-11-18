import React from 'react';
import { g } from '../lib/glyphs.js';
import { Text, type Key } from 'ink';
import { useSafeInput } from '../hooks/use-safe-input.js';
import { t, getLanguage } from '../i18n/index.js';
import { semantic } from '../theme.js';
import { useMachine } from '../hooks/use-app-machine.js';
const bindings = {
  quit: ['q'], retry: ['r'], down: ['downArrow', 'j'], up: ['upArrow', 'k'],
  mark: [' '], all: ['a'], none: ['n'], next: ['return'], settings: ['s'],
  back: ['escape'], detail: ['d'], language: ['l'], elevate: ['e'], start: ['return', 'y'], cancel: ['escape'], ctrlC: ['ctrl+c'], confirmCancel: ['s'], continueRun: ['n', 'escape'],
} as const;
export type CommandAction = keyof typeof bindings;
export type Handlers = Partial<Record<CommandAction, () => void>>;
export interface Command { keys: readonly string[]; label: string; run: () => void }
export function commandsFor(handlers: Handlers): Command[] {
  return (Object.entries(handlers) as [CommandAction, () => void][]).map(([action, run]) => ({ keys: action === 'confirmCancel' && getLanguage() === 'en' ? ['y'] : bindings[action], label: t('hints', action), run }));
}
export function dispatchKey(commands: Command[], key: string): void {
  commands.find(command => command.keys.includes(key))?.run();
}
export function hintLines(commands: Command[], width: number): string[] {
  const lines: string[] = [];
  for (const command of commands) {
    const last = lines.at(-1);
    if (last && last.length + command.label.length + 3 <= width) lines[lines.length - 1] = `${last} ${g.separator} ${command.label}`;
    else lines.push(command.label);
  }
  return lines;
}
export function useScreenKeys(handlers: Handlers): Command[] {
  const { quitApp } = useMachine();
  const commands = commandsFor({ ...handlers, ctrlC: handlers.ctrlC ?? quitApp });
  useSafeInput((input, key: Key) => {
    const special = ['return', 'escape', 'downArrow', 'upArrow'].find(name => key[name as keyof Key]);
    if (key.ctrl) { if (input === 'c') dispatchKey(commands, 'ctrl+c'); return; }
    if (key.meta && !key.escape) return;
    dispatchKey(commands, special ?? input.toLowerCase());
  });
  return commands;
}
export function KeyHints({ commands }: { commands: Command[] }) {
  const width = Math.min(process.stdout.columns ?? 100, 100) - 4;
  return <Text color={semantic.muted}>{hintLines(commands, width).join('\n')}</Text>;
}
