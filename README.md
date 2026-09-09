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

Las señales que se atienden dependen del sistema: `SIGINT` (Ctrl+C), `SIGTERM` y `SIGHUP` en los tres,
más `SIGBREAK` (Ctrl+Break) en Windows, donde existe. Cerrar la ventana de la consola llega como
`SIGHUP` y deja su línea de cierre: se escribe de forma **sincrónica** y **antes** de cancelar la
corrida, así que no gasta el margen que el sistema da antes de matar el proceso. En Windows ese margen
es de **5000 ms** (`SPI_GETHUNGAPPTIMEOUT`) y escribir el cierre mide **0,08 ms**. La verificación corre
en la matriz: el paso *Probe* de `windows-latest` lanza el binario en su propia consola y la cierra.

**Límite conocido, y está documentado como imposible, no como pendiente:** cerrar sesión, reiniciar o
apagar Windows **no entrega ninguna señal**. libuv mapea a `SIGHUP` sólo `CTRL_CLOSE_EVENT` e ignora
`CTRL_LOGOFF_EVENT` y `CTRL_SHUTDOWN_EVENT`, y `node.exe` enlaza `user32`, lo que según la
documentación de `SetConsoleCtrlHandler` impide que el manejador se llame para esos dos. Una corrida
terminada por un apagado no deja línea de cierre. Cubrirlo necesitaría un registro que confirme cada
línea, no mejor evidencia.

Los registros que sobran y no se pueden retirar se informan con la causa que ese sistema tiene: en
unix es la propiedad del archivo —los dejó una corrida elevada— y viene con el comando que los
retira; en Windows una consola elevada corre como el mismo usuario, así que la propiedad nunca es el
motivo y un rechazo ahí significa que el archivo está bloqueado por otro proceso.

Las corridas que sobran del límite de retención se retiran al arrancar, y lo que no se pudo retirar se
informa una sola vez.

Dos variables de entorno mueven esas rutas, y existen para que las pruebas puedan lanzar el binario
real sin tocar tus datos: `TACUCHI_UPDATER_CONFIG_DIR` y `TACUCHI_UPDATER_LOG_DIR`.

El script Python original se conserva en `legacy/updater_simple.py` como referencia histórica.

## Licencia

MIT
