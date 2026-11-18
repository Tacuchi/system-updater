# Guía de desarrollo

## Desarrollo

```bash
npm install
npm run dev        # ejecutar sin compilar (tsx)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/cli.js
```

La arquitectura (motor de ejecución, modelo de descriptores, máquina de estados) está documentada en [`CLAUDE.md`](../CLAUDE.md) y el sistema de diseño en [`docs/DESIGN.md`](DESIGN.md).


La vista general verificada está en [ARCHITECTURE.md](../ARCHITECTURE.md).

## Construcción y comprobación

`updater` apunta a `dist/cli.js`; el paquete distribuye `dist/` y npm instala las dependencias externas al archivo generado.
Las dependencias se cambian en el manifiesto y en la configuración de tsup.
`npm run build` usa tsup con cabecera Node; el paso posterior comprueba esa cabecera ejecutable.
TypeScript, tsx y Vitest son herramientas de desarrollo.
Las versiones de dependencias son rangos del manifiesto; declararlas no sustituye probar el runtime elegido.
CI usa Node 20 y Python 3.12, sin excluir cambios de documentación.
No ejecutes una corrida real para comprobar documentación: las pruebas usan gestores simulados.

## Mapa de módulos

- `src/cli.tsx`: entrada; `src/app.tsx`, `src/screens/` y `src/components/`: siete pantallas, cabecera y salida por líneas.
- `src/screens/keys.tsx`: tabla común de manejo y pistas; `src/hooks/use-safe-input.ts`: suscripción estable al teclado.
- `src/theme.ts`, `src/lib/terminal-theme.ts` y `src/lib/glyphs.ts`: tokens por tema, consulta acotada y respaldo ASCII.
- `src/lib/display-counts.ts` y `src/lib/display-path.ts`: conteos traducidos y rutas compactas.
- `src/hooks/use-app-machine.tsx` y `src/state/`: máquina de aplicación.
- `src/managers/registry.ts` y `src/managers/descriptors/index.ts`: registro y selección de descriptores.
- `src/managers/descriptor.ts`, `src/managers/engine.ts` y `src/managers/descriptors/`: contrato, adaptación y gestores ejecutables.
- `src/lib/exec/engine.ts`: planificación de los dos carriles.
- `src/lib/exec/run.ts`, `src/lib/exec/decode.ts`, `src/lib/exec/kill-tree.ts` y `src/lib/executor.ts`: procesos, decodificación y terminación de árboles.
- `src/lib/result/`: reconciliación por paquete y gestor.
- `src/lib/config.ts`: lectura, normalización, guardado, rutas y migración de preferencias.
- `src/lib/logger.ts`, `src/lib/log-retention.ts`, `src/lib/run-closure.ts` y `src/lib/signals.ts`: diagnóstico, poda y cierre.
- `src/lib/self-update.ts`: consulta y almacenamiento de la respuesta de versión propia.
- `tsup.config.ts`, `scripts/assert-shebang.mjs` y `.github/workflows/ci.yml`: empaquetado, cabecera y matriz de comprobaciones.

## Pruebas de interfaz y sondas

`src/app.frames.test.tsx` monta la aplicación con detección, motor y versión simulados.
Rechaza comandos del sistema y vuelca frames de las siete pantallas a archivos temporales.
`UPDATER_FRAME_DIR` cambia el destino de esos frames.
La matriz cubre español e inglés, 100/80/60 columnas y presencia o ausencia de versión nueva.
Incluye fallo de detección, selección vacía, fallo parcial, cancelación retenida y salida por líneas sin CI.
Las pruebas de tema verifican respuestas grabadas, fallback oscuro y contraste de los tokens claros.
Los conteos, las pistas y la guía de diseño tienen comprobaciones específicas.

```sh
TACUCHI_ASCII=1 NO_COLOR=1 npm test -- src/app.frames.test.tsx
node scripts/probes/terminal-theme.mjs --fixtures
node scripts/probes/header-width.mjs
```

Las sondas de `scripts/probes/` quedan fuera de la suite y del paquete publicado.
El [catálogo de sondas](../scripts/probes/README.md) reúne requisitos, comandos y handoffs.
La sonda de paquetes lee registros existentes y solo devuelve conteos.
La de entrada usa una pseudo-terminal Unix, Ink y un hijo falso que lee `/dev/tty`; no usa sudo.
Caracteriza la contienda de lectores durante una contraseña, cuyo arreglo queda fuera del cambio de interfaz.
La sonda de tema consulta la terminal actual sin arrancar la aplicación.
Medir otras terminales y una consola Windows real complementa las pruebas locales; no se presenta como evidencia ya obtenida.
La aplicación real solo se usa con `--help` o `--version` para estas comprobaciones.

## Decisiones y contribuciones

[0006](decisions/0006-reutilizar-componentes-y-estado-en-terminal.md) reutiliza componentes y estado con React, Ink y TypeScript.
[0007](decisions/0007-compartir-ejecucion-y-verificacion-con-descriptores.md) facilita nuevos gestores compartiendo ejecución y verificación.
Sus motivos fueron confirmados por la persona el 2026-11-18; esa revisión también confirmó aceptar issues y pull requests.
