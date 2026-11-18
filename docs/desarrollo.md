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

- `src/cli.tsx`: entrada; `src/app.tsx`, `src/screens/` y `src/components/`: pantallas, cabecera y salida global.
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

## Decisiones y contribuciones

[0006](decisions/0006-reutilizar-componentes-y-estado-en-terminal.md) reutiliza componentes y estado con React, Ink y TypeScript.
[0007](decisions/0007-compartir-ejecucion-y-verificacion-con-descriptores.md) facilita nuevos gestores compartiendo ejecución y verificación.
Sus motivos fueron confirmados por la persona el 2026-11-18; esa revisión también confirmó aceptar issues y pull requests.
