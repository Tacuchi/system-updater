# Plan v1.1: Frameworks, Cross-Platform y UI Minimalista

## Contexto
El proyecto soporta 12 gestores de paquetes del sistema (brew, pip, npm, etc.) pero no detecta frameworks/herramientas de desarrollo como Flutter, Dart, Angular CLI, etc. Además, hay oportunidades de mejorar el soporte cross-platform y reducir ruido visual en la UI.

---

## 1. Nuevos managers: Frameworks y herramientas de desarrollo

### Nuevos gestores a implementar

**Flutter/Dart** (`src/managers/flutter.ts`)
- Plataformas: macOS, Linux, Windows
- Detectar: `flutter --version`
- Listar: `flutter upgrade --dry-run` (parsear output) + `dart pub outdated` para paquetes globales
- Actualizar: `flutter upgrade`
- Admin: no

**Angular CLI** (`src/managers/angular.ts`)
- Plataformas: todas (depende de npm)
- Detectar: `ng version`
- Listar: comparar versión instalada con `npm view @angular/cli version`
- Actualizar: `npm update -g @angular/cli`
- Admin: no

**Rust/Cargo** (`src/managers/cargo.ts`)
- Plataformas: todas
- Detectar: `rustup --version`
- Listar: `rustup check` (parsear output)
- Actualizar: `rustup update`
- Admin: no

**Go** (`src/managers/go.ts`)
- Plataformas: todas
- Detectar: `go version`
- Listar: solo informativo (Go no tiene update nativo, mostrar versión actual vs última)
- Actualizar: solo lectura, mostrar comando manual
- Admin: no (requiresAdmin: false, pero manualCommand)

**Composer / PHP** (`src/managers/composer.ts`)
- Plataformas: todas
- Detectar: `composer --version`
- Listar: `composer global outdated --format=json`
- Actualizar: `composer global update`
- Admin: no

### Cambios en registry.ts
- Importar y registrar los 5 nuevos managers en `ALL_MANAGERS`
- Agregar traducciones en `es.ts` y `en.ts` bajo `managers`

### No incluir (justificación)
- **Docker**: no es un gestor de paquetes del sistema; sus imágenes son proyecto-específicas
- **nvm/rbenv/pyenv**: son version managers, no package managers; actualizar SDKs es diferente de actualizar paquetes

---

## 2. Soporte cross-platform: revisión y garantías

### Problemas identificados

**executor.ts — sudo en Windows**
- Estado actual: `withSudo` ya skippea sudo en win32 ✓
- Pendiente: En Windows, winget no necesita sudo pero sí elevación UAC para ciertos paquetes. Documentar limitación.

**cli.tsx — re-exec con sudo**
- Estado actual: solo se ejecuta en `process.platform !== 'win32'` ✓
- Pendiente: En Windows, el re-exec no aplica. Agregar mensaje informativo si se pasa `--sudo` en Windows.

**pip.ts — pip vs pip3**
- Estado actual: usa `pip` en win32, `pip3` en otros ✓
- Sin cambios necesarios.

**platform.ts — detección de OS**
- Estado actual: cubre darwin, win32, linux ✓
- Sin cambios necesarios.

**Managers Linux (apt, dnf, pacman, snap, flatpak)**
- Estado actual: detectan correctamente por plataforma ✓
- Pendiente: `apt` y `dnf` necesitan sudo para actualizar. Verificar que el flujo `--sudo` + re-exec funciona en Linux (no hay `tty_tickets` como macOS).

**Managers Windows (winget)**
- Estado actual: solo winget registrado para win32 ✓
- Pendiente: agregar `choco` (Chocolatey) como manager alternativo para Windows.

### Nuevo manager: Chocolatey (`src/managers/choco.ts`)
- Plataforma: win32
- Detectar: `choco --version`
- Listar: `choco outdated --limit-output` (formato pipe-separated)
- Actualizar: `choco upgrade all -y`
- Admin: sí (requiresAdmin: true)

### Cambios específicos
- `cli.tsx`: agregar mensaje si `--sudo` en Windows → "En Windows, ejecuta como Administrador"
- `executor.ts`: sin cambios (ya maneja win32)
- Testear que los nuevos managers respetan `platforms` correctamente

---

## 3. UI: optimización minimalista (+10%)

### Dashboard (`dashboard.tsx`)
- Reducir padding: `paddingX={2}` → `paddingX={1}`, `paddingY={1}` → `paddingY={0}`
- Quitar separador `─` repetido (líneas 63-64 y 107-108) — usar solo espacio vertical
- Header: eliminar el texto "PANEL_" redundante, dejar solo el StatusPill
- Tabla de gestores: reducir columna VERSION a 12 chars, ACTUALIZACIONES a 8 chars
- Resumen inferior: quitar el texto "gestores" y dejar solo los números

### Package Sync (`package-sync.tsx`)
- Reducir acciones rápidas de 3 líneas a 1 línea inline en el header
- Quitar la barra de confirmación inferior con borde — integrar info en el header
- Reducir anchos de columna: GESTOR 10, PAQUETE 20, VERSION 12, NUEVA 12

### Active Updates (`active-updates.tsx`)
- Reducir padding general a `paddingX={1}`
- Contadores inferiores (ACTIVO/EXITOSO/ERRORES): hacerlos inline en el header en vez de bloque separado

### Settings (`settings.tsx`)
- Reducir ancho del sidebar de 20 a 16 chars
- Quitar el bloque "● ESTADO" del sidebar — es información que no aporta valor

### NavBar (`nav-bar.tsx`)
- Sin cambios — ya es compacta

### KeyHintBar (`key-hint-bar.tsx`)
- Sin cambios — ya es compacta

### Principios aplicados
- Eliminar separadores decorativos (`─` repetido)
- Reducir padding donde no mejore legibilidad
- Consolidar información dispersa en una sola línea cuando sea posible
- Mantener toda la información funcional, solo eliminar redundancia visual

---

## Orden de implementación

1. **Fase A — Nuevos managers** (independiente)
   - Crear los 6 archivos de managers (flutter, angular, cargo, go, composer, choco)
   - Registrar en registry.ts
   - Agregar i18n

2. **Fase B — Cross-platform** (independiente)
   - Mensaje `--sudo` en Windows
   - Verificar flujo sudo en Linux

3. **Fase C — UI minimalista** (independiente)
   - Aplicar reducciones de padding/spacing
   - Eliminar separadores decorativos
   - Consolidar líneas de información

Las 3 fases son independientes y pueden implementarse en cualquier orden.
