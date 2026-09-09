# @tacuchi/updater

TUI multiplataforma para actualizar **todos** los gestores de paquetes de tu sistema desde un solo flujo. macOS · Linux · Windows. Sin permisos de administrador (salvo los gestores que los exigen).

```bash
npx @tacuchi/updater          # ejecutar sin instalar
npx @tacuchi/updater --sudo   # incluir gestores que requieren admin (apt, dnf, pacman, snap, choco)
```

## Qué hace

Un flujo lineal claro: **Detectar → Seleccionar → Confirmar → Actualizar → Resumen**.

- Detecta automáticamente los gestores instalados y busca actualizaciones en paralelo.
- Verás spinners mientras trabaja y un resumen inequívoco al terminar (qué se actualizó, qué falló y **por qué**, con la ruta del log).
- Verificación real: cada actualización se confirma re-listando paquetes desactualizados — un fallo nunca se reporta como éxito.

## Gestores soportados (27)

- **Sistema**: brew, softwareupdate, apt, dnf, pacman
- **Lenguajes/runtimes**: npm, pnpm, yarn, bun, pip, pipx, conda, gem, composer, angular
- **Apps/tiendas**: winget, choco, flatpak, snap, mas, scoop
- **SDK/toolchains**: rustup, cargo, mise, asdf, flutter, go

Los gestores que requieren admin (apt, dnf, pacman, snap, choco) se actualizan con `--sudo`; sin permisos muestran el comando manual en vez de fallar en silencio.

## Desarrollo

```bash
npm install
npm run dev        # ejecutar sin compilar (tsx)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/cli.js
```

La arquitectura (motor de ejecución, modelo de descriptores, máquina de estados) está documentada en [`CLAUDE.md`](./CLAUDE.md) y el sistema de diseño en [`docs/DESIGN.md`](./docs/DESIGN.md).

## Config y logs

El archivo de preferencias **se crea con sus valores por omisión la primera vez que se necesita**, así
que siempre hay algo que leer y editar.

| | macOS / Linux | Windows |
|---|---|---|
| Preferencias | `~/.tacuchi-updater/config.json` | `%APPDATA%\tacuchi-updater\config.json` |
| Registros | `~/.tacuchi-updater/logs/` | `%LOCALAPPDATA%\tacuchi-updater\Logs\` |

Campos:

| Campo | Por omisión | Qué hace |
|---|---|---|
| `language` | `es` | Idioma de la interfaz (`es` \| `en`). |
| `enabledManagers` | `{}` | Gestores desactivados explícitamente. Lo que no está, está habilitado. |
| `concurrency` | `4` | Gestores actualizados en paralelo (se acota a 1..8). |
| `timeoutsMs` | `{}` | Espera máxima por gestor, en ms. |
| `logTailBytes` | `16384` | Cuánta salida de cada comando se guarda en el registro. |
| `logRetentionRuns` | `30` | Cuántas corridas de registro se conservan. Por **cantidad** y no por antigüedad, porque las corridas llegan en ráfagas. |
| `selfCheck` | `true` | Consultar a npm, **a lo sumo una vez cada 24 h y sin bloquear**, si hay una versión más nueva del updater. Un fallo de red no detiene ni demora la corrida: sólo queda anotado en el registro. |

El registro anota cada sondeo de presencia, cada listado de pendientes y cada comando ejecutado con su
salida, y **termina siempre con una línea de cierre que declara cómo terminó la corrida** — completa,
cancelada, interrumpida, fallida o cedida a una consola elevada.

Las corridas que sobran del límite de retención se retiran al arrancar. Las que este proceso no puede
retirar —los registros que dejó una corrida `--sudo`, que en unix pertenecen a root— se informan una
vez, con el comando exacto para retirarlas.

Dos variables de entorno mueven esas rutas, y existen para que las pruebas puedan lanzar el binario
real sin tocar tus datos: `TACUCHI_UPDATER_CONFIG_DIR` y `TACUCHI_UPDATER_LOG_DIR`.

El script Python original se conserva en `legacy/updater_simple.py` como referencia histórica.

## Licencia

MIT
