# Plan: System Updater → CLI TUI multiplataforma como paquete npm

## Contexto

El proyecto actual es un script Python de archivo único (`updater_simple.py`, 454 líneas) que actualiza gestores de paquetes en macOS. El objetivo es transformarlo en un **paquete npm multiplataforma** (`@tacuchi/updater`) con una **TUI moderna** estilo "Neon Brutalist" según `docs/DESIGN.md`. Debe funcionar sin permisos de administrador en Windows, Linux y macOS.

- **Paquete**: `@tacuchi/updater` → `npx @tacuchi/updater`
- **Python original**: Mover `updater_simple.py` a `legacy/`
- **Idioma**: i18n con español (por defecto) + inglés

---

## Stack técnico

| Componente | Tecnología |
|---|---|
| Framework TUI | **Ink 6.x** (React para CLI) + React 19 |
| Componentes UI | `@inkjs/ui`, componentes custom |
| Colores | `chalk` (truecolor hex) |
| Ejecución de procesos | `execa` (streaming cross-platform) |
| Lenguaje | **TypeScript** con JSX |
| Build | `tsup` (transpila TS/JSX → JS ESM) |
| Dev | `tsx` (ejecución directa sin build) |
| i18n | Módulo propio con ES/EN, español por defecto |

---

## Arquitectura

```
src/
├── cli.tsx                 # Entry point: args + Ink render()
├── app.tsx                 # Root: estado global + router de pantallas
├── theme.ts                # Tokens de color de DESIGN.md
├── i18n/
│   ├── index.ts            # Sistema i18n: detecta locale, exporta t()
│   ├── es.ts               # Strings en español (por defecto)
│   └── en.ts               # Strings en inglés
├── screens/
│   ├── dashboard.tsx       # Pantalla 1: resumen del sistema
│   ├── active-updates.tsx  # Pantalla 2: progreso de actualizaciones
│   ├── package-sync.tsx    # Pantalla 3: tabla de paquetes seleccionables
│   └── settings.tsx        # Pantalla 4: configuración
├── components/
│   ├── nav-bar.tsx         # Barra de navegación superior
│   ├── ghost-box.tsx       # Marco Unicode box-drawing
│   ├── progress-gauge.tsx  # Barra de progreso "Vibrant Gauge"
│   ├── status-pill.tsx     # Indicadores [OK] [ERR] [ACTIVO]
│   ├── stat-card.tsx       # Tarjeta de estadísticas
│   ├── log-stream.tsx      # Panel de log en tiempo real
│   ├── data-table.tsx      # Tabla seleccionable con teclado
│   ├── toggle-switch.tsx   # Toggle ON/OFF para settings
│   └── key-hint-bar.tsx    # Barra inferior de atajos de teclado
├── managers/
│   ├── types.ts            # Interface PackageManager
│   ├── registry.ts         # Detección y registro de gestores
│   ├── brew.ts             # macOS: Homebrew
│   ├── pip.ts              # Todas: pip/pip3
│   ├── npm-mgr.ts          # Todas: npm
│   ├── conda.ts            # Todas: conda
│   ├── gem.ts              # Todas: RubyGems
│   ├── softwareupdate.ts   # macOS: softwareupdate
│   ├── winget.ts           # Windows: winget
│   ├── apt.ts              # Linux: apt (Debian/Ubuntu)
│   ├── dnf.ts              # Linux: dnf (Fedora/RHEL)
│   ├── pacman.ts           # Linux: pacman (Arch)
│   ├── flatpak.ts          # Linux: Flatpak
│   └── snap.ts             # Linux: Snap
├── hooks/
│   ├── use-managers.ts     # Detección + estado de gestores
│   ├── use-updates.ts      # Ejecución de actualizaciones con progreso
│   └── use-system-info.ts  # Info del sistema (OS, uptime, etc.)
└── lib/
    ├── executor.ts         # Wrapper de execa con streaming + timeout
    ├── platform.ts         # Detección de OS
    ├── logger.ts           # Logging a archivo (formato log4j)
    └── config.ts           # Persistencia de config en ~/.tacuchi-updater/
```

---

## Gestores de paquetes por plataforma

### Sin permisos de admin (actualización directa)
| Gestor | Plataforma | Detectar | Listar | Actualizar |
|--------|-----------|----------|--------|------------|
| Homebrew | macOS | `brew --version` | `brew outdated --json` | `brew upgrade` |
| pip | Todas | `pip3 --version` | `pip list --outdated --format=json` | `pip install --user --upgrade` |
| npm | Todas | `npm --version` | `npm outdated -g --json` | `npm update -g` |
| conda | Todas | `conda --version` | `conda update --all --dry-run --json` | `conda update --all -y` |
| gem | Todas | `gem --version` | `gem outdated` | `gem update --user-install` |
| winget | Windows | `winget --version` | `winget list --upgrade-available` | `winget upgrade --all` |
| flatpak | Linux | `flatpak --version` | `flatpak remote-ls --updates` | `flatpak update -y` |

### Solo lectura (requiere admin para actualizar)
| Gestor | Plataforma | Listar | Comando manual mostrado |
|--------|-----------|--------|-------------------------|
| softwareupdate | macOS | `softwareupdate -l` | `sudo softwareupdate -i -a` |
| apt | Linux | `apt list --upgradable` | `sudo apt upgrade` |
| dnf | Linux | `dnf check-update` | `sudo dnf upgrade` |
| pacman | Linux | `checkupdates` | `sudo pacman -Syu` |
| snap | Linux | `snap refresh --list` | `sudo snap refresh` |

---

## Fases de implementación

### Fase 0: Scaffolding del proyecto
- Mover `updater_simple.py` → `legacy/updater_simple.py`
- Crear `package.json` con `"name": "@tacuchi/updater"`, `"bin"`, dependencias
- Crear `tsconfig.json` con JSX, ESM, strict mode
- Crear `tsup.config.ts` con shebang `#!/usr/bin/env node`
- Crear `src/cli.tsx` minimal que renderice "Hola mundo" con Ink fullscreen
- Actualizar `.gitignore` con `node_modules/`, `dist/`
- **Verificación**: `npx tsx src/cli.tsx` renderiza en terminal

### Fase 1: Sistema de diseño + componentes base
- `src/theme.ts` — todos los tokens de `DESIGN.md` como constantes chalk
- Componentes: `ghost-box`, `nav-bar`, `key-hint-bar`, `status-pill`, `stat-card`, `progress-gauge`, `log-stream`, `data-table`, `toggle-switch`
- **Verificación**: pantalla galería con todos los componentes y datos mock

### Fase 2: Infraestructura de gestores (paralelo con Fase 1)
- `src/lib/platform.ts` — detección de OS
- `src/lib/executor.ts` — wrapper execa con streaming AsyncGenerator
- `src/managers/types.ts` — interface `PackageManager`
- Implementar cada gestor (brew, pip, npm, conda, gem, softwareupdate, winget, apt, dnf, pacman, flatpak, snap)
- `src/managers/registry.ts` — detección automática por plataforma
- **Verificación**: ejecutar detección en la plataforma actual

### Fase 3: Estado global + navegación
- `src/app.tsx` — useReducer + Context para estado global
- Hooks: `use-managers`, `use-updates`, `use-system-info`
- Router de pantallas por teclado (Tab, números, atajos)
- **Verificación**: navegar entre 4 pantallas, estado persiste

### Fase 4: Pantallas
- **Dashboard**: info del sistema, tarjetas de gestores, contadores, log en vivo
- **Active Updates**: barras de progreso split con log stream
- **Package Sync**: tabla seleccionable, selección con Space, actualizar con U
- **Settings**: sidebar + toggles, intervalos, verbosidad
- **Verificación**: cada pantalla con datos reales del sistema

### Fase 5: Config + Logging (paralelo con Fase 4)
- `src/lib/config.ts` — persistencia en `~/.tacuchi-updater/config.json`
- `src/lib/logger.ts` — logs en `~/.tacuchi-updater/logs/` formato log4j
- **Verificación**: settings persisten entre reinicios, logs generados

### Fase 6: Build + publicación
- Build final con tsup
- `npm pack` + test local
- README actualizado con instrucciones cross-platform
- **Verificación**: `npx @tacuchi/updater` funciona correctamente

---

## Decisiones clave

1. **Ink fullscreen**: Usar opción `fullscreen` de `render()` para buffer alterno (dashboard requiere pantalla completa, no inline)
2. **Estado**: `useReducer` + `Context` (4 pantallas, complejidad moderada, no necesita Redux)
3. **Streaming**: `AsyncGenerator` para `upgrade()` — progreso en tiempo real al UI
4. **Sin admin**: Solo ejecutar comandos user-space. Para gestores que necesitan sudo, mostrar comando manual
5. **Idioma**: i18n con español (defecto) + inglés. Archivo de strings separado por idioma, función `t('key')` para acceso
6. **Config**: `~/.tacuchi-updater/config.json` (directorio home, no local al proyecto)
7. **JSON parsing**: Usar `--json` donde disponible (brew, pip, npm, conda); regex defensivo para text output

---

## Archivos críticos existentes

- `legacy/updater_simple.py` — lógica de negocio original como referencia
- `docs/DESIGN.md` — spec completa del diseño "Neon Brutalist"
- `CLAUDE.md` — convenciones del proyecto (actualizar con info Node.js)
- `.gitignore` — actualizar con entradas Node.js (`node_modules/`, `dist/`)

---

## Verificación end-to-end

1. `npm run dev` (tsx) levanta la TUI en fullscreen
2. Dashboard muestra gestores detectados del sistema real
3. Package Sync lista paquetes desactualizados reales
4. Seleccionar paquetes y ejecutar actualización muestra progreso en Active Updates
5. Settings persisten entre sesiones (`~/.tacuchi-updater/config.json`)
6. Cambio de idioma ES↔EN funciona desde Settings
7. `npm run build && npx .` ejecuta el CLI compilado
8. Testar en macOS (brew+pip+npm), Linux (apt+pip+npm), Windows (winget+pip+npm)
