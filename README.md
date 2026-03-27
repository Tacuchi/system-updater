# Sistema de Actualización Simple para macOS

Sistema de actualización directo y realista para gestores de paquetes en macOS con logging profesional.

## Uso Rápido

```bash
# Ejecutar el script
python3 updater_simple.py

# Con conda (opcional)
conda activate system-updater
python updater_simple.py
```

## Archivos del Proyecto

- **`updater_simple.py`** - Script principal
- **`USO_SIMPLE.md`** - Documentación completa
- **`ejemplos_directos.txt`** - Ejemplos de uso rápidos
- **`environment.yml`** - Configuración de conda (opcional)
- **`logs/`** - Carpeta de logs automáticos

## Qué Hace

**Actualiza completamente (sin errores):**
- Homebrew
- pip
- macOS (lista actualizaciones)

**Solo verifica (evita errores de permisos):**
- npm (lista paquetes desactualizados)
- conda (muestra información)
- gem (lista paquetes desactualizados)

## Logging Automático

Cada ejecución crea un log detallado en `logs/system_updater_YYYYMMDD_HHMMSS.log` con:
- Comandos ejecutados
- Resultados completos
- Errores detallados
- Información de debugging

## Comandos Manuales Post-Verificación

```bash
# npm (después de ver qué está desactualizado)
sudo chown -R $(whoami) ~/.nvm && npm update -g

# conda (después de ver información)
conda update --all

# gem (después de ver qué está desactualizado)
gem update --user-install
```

## Configuración de Conda (Opcional)

```bash
# Crear entorno
conda env create -f environment.yml

# Activar
conda activate system-updater
```

---

Script simple, consola limpia, logs completos. 