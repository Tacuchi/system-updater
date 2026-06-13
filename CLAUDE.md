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

- **`src/cli.tsx`**: Entry point — re-exec sudo (macOS) + renderiza `<App>` con Ink.
- **`src/app.tsx`**: Root — `useAppMachine` + router por **fase** (no por tabs). Tecla global `q`.
- **`src/state/`**: Máquina de estados — `types.ts` (Phase, ManagerStatus, AppState), `actions.ts` (Action union), `app-reducer.ts` (reducer puro, testeado). `BATCH` coalesce eventos por frame.
- **`src/hooks/use-app-machine.tsx`**: Orquestador — conecta el reducer con detección/escaneo y el motor (`runEngine`); mapea `EngineProgress` → acciones.
- **`src/screens/`**: 5 pantallas del flujo lineal — `detect`, `select`, `confirm`, `update`, `summary` (+ `settings-screen` overlay).
- **`src/components/`**: `status-glyph` (única fuente estado→glifo+color), `step-header`, `manager-row` (memo), `log-pane` (memo).
- **`src/managers/`**: `descriptor.ts` (contrato declarativo), `engine.ts` (`fromDescriptor` — **único constructor de `UpgradeResult`**), `registry.ts`, `descriptors/*.ts` (27 gestores), `types.ts` (interfaces).
- **`src/lib/exec/`**: `run.ts` (`runExec`/`runStream` → `CommandRecord`), `engine.ts` (`runEngine`: pool con concurrencia + lane sudo serial + `AbortSignal`), `sudo.ts`, `percent.ts`, `capabilities.ts` (`once()`).
- **`src/lib/result/`**: `classify.ts` (clasifica por exit code), `verify.ts` (`reconcile` — diff antes/después), `report.ts` (`SessionReport`).
- **`src/lib/`**: `executor.ts` (`execCommand` buffer completo + `execStream` wrapper), `logger.ts` (log4j + `logCommand`/`logResult`), `config.ts`, `platform.ts`.
- **`src/i18n/`**: ES/EN — `t(section, key)` (claves estáticas) y `managerName(id)` (lookup dinámico).

### Flujo lineal (máquina de estados)

`boot → detecting → scanning → select → confirm → updating → summary` (con `settings` como overlay que recuerda `prevPhase`). Estado por-gestor de primera clase: `pending | scanning | outdated | uptodate | queued | running | done | failed | skipped`.

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

- Config: `~/.tacuchi-updater/config.json` — `enabledManagers`, `language`, `verbosity`, **`concurrency`** (default 4, clamp 1–8), **`timeoutsMs`** (por gestor), **`logTailBytes`** (16384), **`managers`** (enable/timeout por gestor). `normalizeConfig()` aplica defaults + clamp.
- Logs: `~/.tacuchi-updater/logs/system_updater_YYYYMMDD_HHMMSS.log`. Formato: `2026-03-26 15:30:00 [INFO ] SystemUpdater - mensaje`. Ahora se registra **cada comando ejecutado** (exit code, duración, tail de stdout/stderr) → "por qué falló" siempre responsable desde el log.

## Testing

Vitest. Las funciones puras son las semillas de test: parsers de descriptores (`parseOutdated`/`parseVersion`), `classifyCommand`, `reconcile`, el reducer (`appReducer`), `toManagerResult`. Smoke de UI con `ink-testing-library` (`src/app.smoke.test.tsx`) recorre detect→select→confirm→update→summary.

## Language

UI en **Español** (default) e **Inglés** (`src/i18n/{es,en}.ts`; ambos locales deben tener las mismas claves). El código, comentarios y logs en inglés; los strings de interfaz vía `t()`/`managerName()`.

## Design System

Ver `docs/DESIGN.md`. La paleta operativa del flujo es **semántica** (`src/theme.ts` → `semantic`): `action` (foco/púrpura), `success` (verde), `error` (rojo), `warning` (rosa/admin), `text`, `muted` — para reducir el ruido visual. Spinners (`@inkjs/ui`) para trabajo indeterminado; `ProgressBar` cuando hay `percent`; glifos de estado vía `status-glyph`. Bordes Unicode box-drawing.
