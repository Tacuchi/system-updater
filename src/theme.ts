// Tokens del sistema de diseño "Neon Brutalist" / "The Kinetic Console"
// Referencia: docs/DESIGN.md

export const colors = {
  // Superficies (fondo)
  surface: '#131313',
  surfaceContainer: '#201f1f',
  surfaceContainerLow: '#1c1b1b',
  surfaceContainerHigh: '#2a2a2a',
  surfaceContainerHighest: '#353534',
  surfaceContainerLowest: '#0e0e0e',

  // Primario (púrpura)
  primary: '#c9bfff',
  primaryContainer: '#6a49f8',
  onPrimary: '#131313',
  onPrimaryContainer: '#f0e9ff',

  // Secundario (rosa)
  secondary: '#ffade0',
  secondaryContainer: '#7a3060',
  onSecondary: '#131313',
  onSecondaryContainer: '#ffd8ef',

  // Terciario (verde - señal de éxito/activo)
  tertiary: '#31e368',
  tertiaryContainer: '#005229',
  onTertiary: '#131313',
  onTertiaryContainer: '#adffd0',

  // Error
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',
  onErrorContainer: '#ffdad6',

  // Texto
  onSurface: '#e5e2e1',
  onSurfaceVariant: '#a09d9c',

  // Bordes
  outlineVariant: '#484556',
  outline: '#6f6d70',
} as const;

// Caracteres Unicode para bordes (estilo "Ghost Border")
export const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  // Doble
  dTopLeft: '╔',
  dTopRight: '╗',
  dBottomLeft: '╚',
  dBottomRight: '╝',
  dHorizontal: '═',
  dVertical: '║',
  // Bloques para progress bar
  blockFull: '█',
  blockDark: '▓',
  blockMedium: '▒',
  blockLight: '░',
  // Indicadores
  bullet: '›',
  dot: '•',
  arrow: '→',
  check: '✓',
  cross: '✗',
} as const;

// Tamaños de espaciado
export const spacing = {
  xs: 1,
  sm: 2,
  md: 4,
  lg: 8,
} as const;
