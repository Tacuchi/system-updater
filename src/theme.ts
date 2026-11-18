export type TerminalTheme = 'light' | 'dark';
export const tokens = {
  dark: { text: '#e6e6e2', muted: '#a3a39b', accent: '#bff278' },
  light: { text: '#111111', muted: '#5c5c56', accent: '#bce489' },
  logo: '#b6f23c', error: '#ffb4ab', warning: '#ffade0', unknown: '#f0b429',
} as const;
export function themeFor(mode: TerminalTheme) {
  const palette = tokens[mode];
  return {
    text: palette.text, muted: palette.muted,
    action: mode === 'light' ? palette.text : palette.accent,
    success: mode === 'light' ? palette.text : palette.accent,
    error: tokens.error, warning: tokens.warning, unknown: tokens.unknown,
    accentFill: palette.accent, logoFill: tokens.logo,
  };
}
export const semantic = themeFor('dark');
export let terminalTheme: TerminalTheme = 'dark';
export const colors = { outline: semantic.muted };
export function setTerminalTheme(mode: TerminalTheme): void {
  terminalTheme = mode;
  Object.assign(semantic, themeFor(mode));
  colors.outline = semantic.muted;
}
