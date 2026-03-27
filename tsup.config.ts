import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  jsx: 'automatic',
  // Dejar todas las dependencias externas — npm las instala automáticamente
  // El binario se distribuye junto con node_modules via npm
  banner: {
    js: '#!/usr/bin/env node',
  },
});
