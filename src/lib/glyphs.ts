/**
 * Centralized glyph set with an ASCII fallback.
 *
 * Unicode box/braille/symbol glyphs render fine in Windows Terminal, macOS
 * Terminal and most Linux terminals, but show as `?`/boxes in legacy Windows
 * conhost / PowerShell 5.1. Colours degrade automatically (chalk detects the
 * terminal and honours NO_COLOR); glyphs do not, so we pick a set here.
 *
 * The exact rendering on a given Windows console is empirically-gated (Open #1):
 * `TACUCHI_ASCII=1`/`0` forces the choice for validation.
 */

export function shouldUseAscii(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): boolean {
  if (env['TACUCHI_ASCII'] === '1') return true;
  if (env['TACUCHI_ASCII'] === '0') return false;
  if (env['TERM'] === 'dumb') return true;
  // Rich glyphs render in Windows Terminal (sets WT_SESSION) but commonly break in
  // legacy conhost / PowerShell 5.1 — degrade unless we know it's Windows Terminal.
  if (platform === 'win32' && !env['WT_SESSION']) return true;
  return false;
}

export interface Glyphs {
  pending: string;
  scanning: string;
  outdated: string;
  uptodate: string;
  running: string;
  done: string;
  failed: string;
  skipped: string;
  cursor: string;
  checkOn: string;
  checkOff: string;
  arrow: string;
  scrollUp: string;
  scrollDown: string;
  stepOn: string;
  stepOff: string;
  info: string;
  ellipsis: string;
  bullet: string;
  reboot: string;
}

const UNICODE: Glyphs = {
  pending: '·',
  scanning: '◌',
  outdated: '›',
  uptodate: '✓',
  running: '▸',
  done: '✓',
  failed: '✗',
  skipped: '⊘',
  cursor: '❯',
  checkOn: '[✓]',
  checkOff: '[ ]',
  arrow: '→',
  scrollUp: '▲',
  scrollDown: '▼',
  stepOn: '▆',
  stepOff: '▁',
  info: 'ⓘ',
  ellipsis: '…',
  bullet: '▸',
  reboot: '⟳',
};

const ASCII_GLYPHS: Glyphs = {
  pending: '.',
  scanning: 'o',
  outdated: '>',
  uptodate: '+',
  running: '>',
  done: '+',
  failed: 'x',
  skipped: '-',
  cursor: '>',
  checkOn: '[x]',
  checkOff: '[ ]',
  arrow: '->',
  scrollUp: '^',
  scrollDown: 'v',
  stepOn: '#',
  stepOff: '_',
  info: 'i',
  ellipsis: '...',
  bullet: '>',
  reboot: '*',
};

export const ASCII = shouldUseAscii(process.env, process.platform);
export const g: Glyphs = ASCII ? ASCII_GLYPHS : UNICODE;

// Animation gate: skip the spinner's timer when glyphs are ASCII (legacy console)
// or stdout is not a TTY (pipe/CI/redirect) — a setInterval would otherwise spam
// frames into a pipe and a braille frame would render as `?` on a legacy console.
export const NO_ANIM = ASCII || !process.stdout.isTTY;

// Single-cell-wide spinner frames so animating never changes a row's column
// width or height (the constant-height invariant of the Update screen). Unicode
// braille degrades to a simple ASCII cycle.
const SPINNER_UNICODE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_ASCII = ['|', '/', '-', '\\'];
export const spinnerFrames: string[] = ASCII ? SPINNER_ASCII : SPINNER_UNICODE;
