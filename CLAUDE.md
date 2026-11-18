# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@tacuchi/updater` — CLI TUI multiplataforma para actualizar gestores de paquetes del sistema. Distribuido como paquete npm, ejecutable con `npx @tacuchi/updater`. Compatible con Windows, Linux y macOS sin permisos de administrador.

El script Python original se conserva en `legacy/updater_simple.py` como referencia.

## Running

```bash
npm run dev          # Desarrollo (sin compilar), via tsx
npm run build        # Build de producción (tsup → dist/cli.js)
node dist/cli.js     # Ejecutar build compilado
npm test             # Suite de tests (vitest run)
npm run typecheck    # tsc --noEmit (gate de tipos)
npm publish --access public
```

`npm test` y `npm run typecheck` deben pasar limpios antes de cualquier commit.

## Architecture

Proyecto TypeScript con React/Ink. El núcleo se divide en un **motor de ejecución honesto** (sin UI) y una **TUI de flujo lineal** sobre una máquina de estados.

- **`src/cli.tsx`**: Entrada: carga el idioma, resuelve elevación, consulta el tema antes de Ink y elige pantallas o líneas según stdout.
- **`src/app.tsx`**: Raíz: `useAppMachine`, proveedor de estado y router por fase; `LineOutput` sustituye las pantallas con salida redirigida.
- **`src/state/`**: Máquina de estados — `types.ts` (Phase, ManagerStatus, AppState), `actions.ts` (Action union), `app-reducer.ts` (reducer puro, testeado). `BATCH` coalesce eventos por frame.
- **`src/hooks/use-app-machine.tsx`**: Orquestador — conecta el reducer con detección/escaneo y el motor (`runEngine`); mapea `EngineProgress` → acciones.
- **`src/screens/`**: Siete pantallas: `detect`, `select`, `confirm`, `update`, `summary`, `detail` y `settings-screen`. `keys.tsx` genera manejo y pistas desde la misma tabla.
- **`src/components/`**: `status-glyph` (estado, glifo y color), `step-header` (marca, versión y paso en una línea) y `line-output` (eventos y resumen sin redibujo).
- **`src/managers/`**: `descriptor.ts` (contrato declarativo), `engine.ts` (`fromDescriptor` — **único constructor de `UpgradeResult`**), `registry.ts`, `descriptors/*.ts` (27 gestores), `types.ts` (interfaces).
- **`src/lib/exec/`**: `run.ts` (`runExec`/`runStream` → `CommandRecord`), `engine.ts` (`runEngine`: pool con concurrencia + lane sudo serial + `AbortSignal`), `sudo.ts`, `percent.ts`, `capabilities.ts` (`once()`).
- **`src/lib/result/`**: `classify.ts` (clasifica por exit code), `verify.ts` (`reconcile` — diff antes/después), `report.ts` (`SessionReport`).
- **`src/lib/`**: `executor.ts` (`execCommand` buffer completo + `execStream` wrapper), `logger.ts` (registro síncrono con `logCommand`/`logResult`), `config.ts`, `platform.ts`.
- **`src/i18n/`**: ES/EN — `t(section, key)` (claves estáticas) y `managerName(id)` (lookup dinámico).

### Flujo lineal (máquina de estados)

`boot → detecting → scanning → select → confirm → updating → summary` (con `settings` y `detail` como pantallas superpuestas que recuerdan `prevPhase`). Estados por gestor: `pending | scanning | outdated | uptodate | queued | running | cancelling | partial | done | failed | skipped | unknown`.

Un fallo de detección muestra motivo y reintento; todo al día permite volver a buscar. Enter sin marcados avisa. Durante Actualizar, Q/Esc preguntan sin detener la corrida; S confirma en español, Y en inglés, y N/Esc vuelven. Enter no confirma esa pregunta. Ctrl+C cancela y sale inmediatamente. Fuera de la corrida, Q sale.

El modo automático depende de stdin sin TTY o de --yes/-y/--all. La salida por líneas depende de stdout sin TTY: usa el mismo estado y cierre, un resultado por gestor y resumen, sin controles de cursor ni pistas. Para redirigir solo stdout se usa --yes. Los controles completos están en [la guía de uso](docs/uso.md).

## Package Managers

Cada gestor es un **descriptor declarativo** (`ManagerDescriptor`: datos + parsers puros). `fromDescriptor()` lo convierte en un `PackageManager` y **corre la verificación** (re-lista outdated tras actualizar y hace diff vía `reconcile()`). **Los descriptores no construyen el resultado** → es imposible falsear éxito. Casos especiales usan `escapeHatch` (pip PEP668, gem ruby, flutter/go vía `fetch` nativo, yarn classic/berry).

Reglas: una sola operación **bulk** por upgrade (sin bucles por paquete); probes caros cacheados con `once()`; clasificación de error por exit code (no substring); `runStream` captura `CommandRecord` (exit/stderr tail) para diagnóstico.

27 gestores (`src/managers/descriptors/index.ts`):
- **system**: brew, softwareupdate, apt, dnf, pacman
- **language/runtime**: npm, pnpm, yarn, bun, pip, pipx, conda, gem, composer, angular
- **apps/stores**: winget, choco, flatpak, snap, mas, scoop
- **sdk/toolchains**: rustup, cargo (cargo-install-update, detect-gated), mise, asdf, flutter, go-lang

`requiresAdmin` (apt/dnf/pacman/snap/choco): corren bajo el lane sudo serial cuando `--sudo`; sin sudo → `status:'noop'` + comando manual. `kind:'readonly'` (softwareupdate): siempre comando manual. Windows no tiene sudo → hint de terminal elevada.

## Config y Logs

- Config: `~/.tacuchi-updater/config.json` — `enabledManagers`, `language`, `verbosity`, **`concurrency`** (default 4, clamp 1–8), **`timeoutsMs`** (por gestor), **`logTailBytes`** (16384 bytes UTF-8 por stdout/stderr), **`managers`** (enable/timeout por gestor). `normalizeConfig()` aplica defaults + clamp.
- `logTailBytes`: el motor lo pasa al ejecutor, incluidas las implementaciones especiales vía `ManagerCtx`. Conserva caracteres completos al recortar la cola. Los valores positivos se redondean con mínimo 1; los inválidos usan 16384. El comportamiento por omisión para ASCII permanece igual. No limita la salida en vivo ni el búfer completo del subproceso.
- Logs: `~/.tacuchi-updater/logs/system_updater_YYYYMMDD_HHMMSS.log`. Formato: `2026-03-26 15:30:00 [INFO ] SystemUpdater - mensaje`. Ahora se registra **cada comando ejecutado** (exit code, duración, tail de stdout/stderr) → "por qué falló" siempre responsable desde el log.

## Testing

Vitest. Las funciones puras son las semillas de test: parsers de descriptores (`parseOutdated`/`parseVersion`), `classifyCommand`, `reconcile`, el reducer (`appReducer`), `toManagerResult`. El smoke con `ink-testing-library` recorre el flujo. `src/app.frames.test.tsx` cubre siete pantallas con gestores y motor simulados, ambos idiomas, anchos y versiones nuevas; incluye cancelación, ASCII y salida sin TTY. Las sondas de `scripts/probes/` caracterizan tema, ancho, paquetes e interacción con un hijo falso. Consulta [desarrollo](docs/desarrollo.md#pruebas-de-interfaz-y-sondas); no se comprueba la UI ejecutando actualizaciones reales.

## Language

UI en **Español** (default) e **Inglés** (`src/i18n/{es,en}.ts`; ambos locales deben tener las mismas claves). El código, comentarios y logs en inglés; los strings de interfaz vía `t()`/`managerName()`.

## Design System

Ver `docs/DESIGN.md`. La paleta semántica de `src/theme.ts` usa tokens de marca claros u oscuros. Acción y éxito usan lima como texto en oscuro; en claro usan texto y reservan la lima al relleno. Error, aviso e indeterminado conservan sus colores. `terminal-theme.ts` lee COLORFGBG u OSC 11/DA1 con espera acotada; sin informe usa oscuro. `glyphs.ts` centraliza Unicode y ASCII; NO_COLOR conserva glifo y palabra. La cabecera no tiene barra de pasos: muestra marca, versión y paso. Una versión nueva agrega solo su número; el comando va a Resumen. La actualización muestra tiempos, paquetes resueltos y el paquete actual cuando Homebrew lo informa. No hay panel de log ni barra gráfica de progreso en las pantallas.
