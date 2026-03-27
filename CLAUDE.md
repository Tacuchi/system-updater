# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@tacuchi/updater` — CLI TUI multiplataforma para actualizar gestores de paquetes del sistema. Distribuido como paquete npm, ejecutable con `npx @tacuchi/updater`. Compatible con Windows, Linux y macOS sin permisos de administrador.

El script Python original se conserva en `legacy/updater_simple.py` como referencia.

## Running

```bash
# Desarrollo (sin compilar)
npm run dev

# Build de producción
npm run build

# Ejecutar build compilado
node dist/cli.js

# Publicar a npm
npm publish --access public
```

## Architecture

Proyecto TypeScript con React/Ink para la TUI. Estructura:

- **`src/cli.tsx`**: Entry point — renderiza `<App>` con Ink en modo fullscreen
- **`src/app.tsx`**: Root component — estado global (useReducer + Context), router de pantallas
- **`src/theme.ts`**: Tokens de color del sistema "Neon Brutalist" (DESIGN.md)
- **`src/i18n/`**: Internacionalización ES/EN con función `t(section, key)`
- **`src/screens/`**: 4 pantallas — Dashboard, Active Updates, Package Sync, Settings
- **`src/components/`**: Componentes reutilizables — GhostBox, NavBar, ProgressGauge, etc.
- **`src/managers/`**: 12 gestores de paquetes con interfaz común `PackageManager`
- **`src/hooks/`**: Hooks — `useManagers`, `useUpdates`, `useSystemInfo`
- **`src/lib/`**: Utilidades — executor (execa), platform (OS), logger (log4j), config (JSON)

## Package Managers

Los gestores implementan la interfaz `PackageManager` con `detect()`, `listOutdated()` y `upgrade()`.

- **Sin admin (actualizan directamente)**: brew, pip, npm, conda, gem, winget, flatpak
- **Solo lectura (muestran comando manual)**: softwareupdate, apt, dnf, pacman, snap

## Config y Logs

- Config del usuario: `~/.tacuchi-updater/config.json`
- Logs timestamped: `~/.tacuchi-updater/logs/system_updater_YYYYMMDD_HHMMSS.log`
- Formato log: `2026-03-26 15:30:00 [INFO ] SystemUpdater - mensaje`

## Language

La UI principal soporta **Español** (por defecto) e **Inglés**. Los strings están en `src/i18n/es.ts` y `src/i18n/en.ts`. El código fuente, comentarios y logs están en inglés; los strings de interfaz en español/inglés según configuración.

## Design System

Ver `docs/DESIGN.md` para la especificación completa del sistema de diseño "The Kinetic Console / Neon Brutalist".

Tokens principales en `src/theme.ts`:
- Surface: `#131313`, Primary: `#c9bfff`, Tertiary: `#31e368` (verde = éxito)
- Bordas: Unicode box-drawing, sin bordes CSS
