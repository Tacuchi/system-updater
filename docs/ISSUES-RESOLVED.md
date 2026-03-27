# Issues Resueltos — System Updater v1.0

## ISS-001: sudo no funciona en subprocesos (macOS)
**Síntoma**: Con `--sudo`, los comandos de actualización no tenían permisos. El log mostraba `sudo: a password is required`.
**Causa raíz**: macOS usa `tty_tickets` por defecto — las credenciales sudo se cachean por TTY. Los subprocesos de `execa` con pipes no tienen TTY, así que `sudo` no encuentra las credenciales cacheadas por `sudo -v`.
**Solución**: Re-ejecutar el proceso completo bajo sudo (`sudo node cli.js --sudo`). El prompt de password aparece antes de que Ink tome el terminal. Dentro del proceso, `process.getuid() === 0` indica que ya somos root.
**Archivo**: `src/cli.tsx` (re-exec), `src/lib/executor.ts` (withSudo)

## ISS-002: Discrepancia de paquetes entre modo normal y sudo
**Síntoma**: Sin `--sudo` se detectaban 91 paquetes, con `--sudo` solo 2-3.
**Causa raíz**: Al re-ejecutar todo el proceso como root, `detect()` y `listOutdated()` corrían como root. El entorno de root (GEM_HOME, PATH, etc.) es diferente al del usuario.
**Solución**: En `withSudo()`, cuando `sudo=false` y somos root (`UID=0`), de-escalar al usuario original con `sudo -iu $SUDO_USER`. El flag `-i` simula un login completo que carga `.zshrc`/`.bashrc`, inicializando RVM, NVM, pyenv, etc.
**Archivo**: `src/lib/executor.ts`

## ISS-003: pip falla con "externally-managed-environment"
**Síntoma**: `pip install --user --upgrade` rechazado con error PEP 668.
**Causa raíz**: Python instalado via Homebrew marca el entorno como "externally managed" (PEP 668). `pip install --user` sin `--break-system-packages` es rechazado.
**Solución**: Antes de actualizar, detectar si el entorno es PEP 668 (ejecutar un dry-run y buscar "externally-managed" en el output). Si lo es, agregar `--break-system-packages` automáticamente.
**Archivo**: `src/managers/pip.ts`

## ISS-004: gem reporta 89 paquetes pero solo 13 son actualizables
**Síntoma**: `gem outdated` listaba 89 gems, pero `gem update` decía "already up-to-date" o "not currently installed" para la mayoría.
**Causa raíz**: Tres categorías de falsos positivos:
1. **Default gems** (64): embebidas en el runtime de Ruby, solo se actualizan cambiando la versión de Ruby.
2. **Bundled gems** (12): en el path secundario de RVM (`rubies/ruby-X.X.X/lib/ruby/gems/`), no en el GEM_HOME activo.
3. **Gems fantasma**: aparecen en `gem outdated` porque están en un GEM_PATH pero no en el directorio donde `gem update` instala.
**Solución**: Filtrar con la Ruby API: `Gem::Specification.select { |s| !s.default_gem? && s.base_dir == Gem.dir }`. Solo incluir gems que no sean default Y que estén en el GEM_HOME activo.
**Archivo**: `src/managers/gem.ts` (listOutdated)

## ISS-005: gem update --user-install falla con RVM
**Síntoma**: Las 13 gems filtradas seguían fallando. El log mostraba "Gems not currently installed".
**Causa raíz**: `--user-install` instala en `Gem.user_dir` (`~/.gem/ruby/X.X.X/`), pero con RVM las gems están en `Gem.dir` (`~/.rvm/gems/ruby-X.X.X/`). Son directorios diferentes, así que gem no encuentra las gems existentes.
**Solución**: Detectar si `GEM_HOME` está configurado (indica RVM/rbenv). Si lo está, omitir `--user-install` ya que el GEM_HOME ya es un directorio user-space.
**Archivo**: `src/managers/gem.ts` (upgrade)

## ISS-006: flutter upgrade falla por cambios locales
**Síntoma**: `flutter upgrade` rechazado con "local changes would be erased".
**Causa raíz**: El checkout de Flutter en `~/Development/flutter` tenía cambios locales (archivos modificados en el repo git de Flutter).
**Solución**: Usar `flutter upgrade --force` que permite actualizar descartando cambios locales.
**Archivo**: `src/managers/flutter.ts`

## ISS-007: flutter upgrade --dry-run no existe
**Síntoma**: `listOutdated()` no detectaba actualizaciones de Flutter.
**Causa raíz**: El flag `--dry-run` no existe en `flutter upgrade`.
**Solución**: Consultar la Flutter Releases API (`storage.googleapis.com/flutter_infra_release/releases/`) para obtener la última versión estable y comparar con la local. Fallback: parsear el banner "A new version is available" de `flutter --version`.
**Archivo**: `src/managers/flutter.ts` (listOutdated)

## ISS-008: App se cuelga durante actualizaciones masivas
**Síntoma**: Con 88+ gems, la UI dejaba de responder.
**Causa raíz**: Cada línea de log del stream triggereaba un `setState` en React/Ink. Con cientos de líneas, el event loop se saturaba re-renderizando.
**Solución**: Throttle de state updates — acumular logs en buffer y flush cada 150ms. Eventos importantes (start, complete, error) se flushean inmediatamente.
**Archivo**: `src/hooks/use-updates.ts`

## ISS-009: Logs con permisos de root impiden ejecución normal
**Síntoma**: `EACCES: permission denied` al escribir en `logs/`.
**Causa raíz**: La sesión con `--sudo` (root) creó archivos en `logs/` con owner root. La siguiente ejecución normal (UID 501) no puede escribir ahí.
**Solución**: Agregar listener `stream.on('error')` que desactiva el stream local sin crashear. El log en `~/.tacuchi-updater/logs/` sigue funcionando.
**Archivo**: `src/lib/logger.ts`

---

## Análisis Cross-Platform

### Linux
**ISS-001 (sudo/tty_tickets)**: Linux NO usa `tty_tickets` por defecto en la mayoría de distros. El re-exec con sudo debería funcionar sin problemas. `sudo -iu` también funciona en Linux.

**ISS-002 (de-escalación)**: Mismo mecanismo aplica. `SUDO_USER` está disponible en Linux. `sudo -iu $SUDO_USER` carga el perfil del usuario correctamente.

**ISS-003 (pip PEP 668)**: Aplica en distros que usan Python gestionado por el sistema (Ubuntu 23.04+, Fedora 38+, Arch). La detección de "externally-managed" ya es genérica y funciona en cualquier OS.

**ISS-004/005 (gem con RVM)**: Aplica igual si el usuario tiene RVM/rbenv en Linux. El filtro de `Gem::Specification` y la detección de `GEM_HOME` son independientes del OS.

**Riesgos específicos Linux**:
- `apt upgrade` requiere sudo → el re-exec ya lo maneja
- `snap refresh` requiere sudo → mismo caso
- `flatpak update` no requiere sudo → sin riesgo

### Windows
**ISS-001 (sudo)**: No aplica. Windows no tiene sudo. El updater ya muestra mensaje informativo si se usa `--sudo` en Windows. Para permisos elevados, el usuario debe abrir la terminal como Administrador.

**ISS-002 (de-escalación)**: No aplica. No hay re-exec con sudo en Windows.

**ISS-003 (pip PEP 668)**: Generalmente no aplica. Python en Windows suele instalarse desde python.org, no gestionado por el sistema. Sin embargo, si se instala desde Microsoft Store, podría aplicar — la detección genérica lo cubre.

**ISS-004/005 (gem con RVM)**: RVM no existe en Windows. Se usa Ruby Installer que tiene un GEM_HOME estándar. `--user-install` debería funcionar correctamente.

**Riesgos específicos Windows**:
- `winget upgrade` puede requerir UAC elevation para ciertos paquetes del sistema. El updater no puede solicitar UAC programáticamente — se necesita ejecutar la terminal como Admin.
- `choco upgrade` requiere Admin. Mismo caso que winget.
- Las rutas de ejecutables pueden variar significativamente (Program Files, AppData, etc.) — `execa` maneja esto correctamente buscando en PATH.

### Resumen de cobertura
| Issue | macOS | Linux | Windows |
|-------|-------|-------|---------|
| ISS-001 sudo/tty | Resuelto | N/A (no hay tty_tickets) | N/A (no hay sudo) |
| ISS-002 de-escalación | Resuelto | Funciona igual | N/A |
| ISS-003 pip PEP 668 | Resuelto | Mismo fix aplica | Raro pero cubierto |
| ISS-004 gem falsos positivos | Resuelto | Mismo fix aplica | N/A (no hay RVM) |
| ISS-005 gem --user-install | Resuelto | Mismo fix aplica | Sin riesgo |
| ISS-006 flutter --force | Resuelto | Mismo fix aplica | Mismo fix aplica |
| ISS-007 flutter API | Resuelto | Mismo fix aplica | Mismo fix aplica |
| ISS-008 UI throttle | Resuelto | Mismo fix aplica | Mismo fix aplica |
| ISS-009 log permisos | Resuelto | Mismo fix aplica | N/A (no hay sudo) |
