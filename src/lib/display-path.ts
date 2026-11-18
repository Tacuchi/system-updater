import { homedir } from 'node:os';
import { g } from './glyphs.js';
export function compactPath(path: string, width: number): string {
  const home = homedir();
  const display = path === home || path.startsWith(home + '/') || path.startsWith(home + '\\') ? '~' + path.slice(home.length) : path;
  if (display.length <= width) return display;
  const available = Math.max(0, width - g.ellipsis.length);
  const left = Math.ceil(available / 2);
  return display.slice(0, left) + g.ellipsis + display.slice(display.length - (available - left));
}
