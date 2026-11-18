# Preferencias y diagnóstico

## Config y logs

El archivo de preferencias **se crea con sus valores por omisión la primera vez que se necesita**, así
que siempre hay algo que leer y editar.

| | macOS / Linux | Windows |
|---|---|---|
| Preferencias | `~/.tacuchi-updater/config.json` | `%APPDATA%\tacuchi-updater\Config\config.json` |
| Registros | `~/.tacuchi-updater/logs/` | `%LOCALAPPDATA%\tacuchi-updater\Log\` |

Campos:

| Campo | Por omisión | Qué hace |
|---|---|---|
| `language` | `es` | Idioma de la interfaz (`es` \| `en`). |
| `enabledManagers` | `{}` | Gestores desactivados explícitamente. Lo que no está, está habilitado. |
| `concurrency` | `4` | Gestores actualizados en paralelo (se acota a 1..8). |
| `timeoutsMs` | `{}` | Espera máxima por gestor, en ms. |
| `logTailBytes` | `16384` | Campo declarado de configuración; el ejecutor usa un límite fijo de 16384 caracteres por salida y el motor no le pasa este campo. |
| `logRetentionRuns` | `30` | Cuántas corridas de registro se conservan. Por **cantidad** y no por antigüedad, porque las corridas llegan en ráfagas. |
| `selfCheck` | `true` | Consultar a npm sin bloquear si hay una versión más nueva. Una respuesta completada se reutiliza 24 h; un fallo se registra y permite reintentar en la siguiente corrida. |

El registro anota cada sondeo de presencia, cada listado de pendientes y cada comando ejecutado con su
salida, y **termina siempre con una línea de cierre que declara cómo terminó la corrida** — completa,
cancelada, interrumpida, fallida o cedida a una consola elevada.

Las señales que se atienden dependen del sistema: `SIGINT` (Ctrl+C), `SIGTERM` y `SIGHUP` en los tres,
más `SIGBREAK` (Ctrl+Break) en Windows, donde existe. Cerrar la ventana de la consola llega como
`SIGHUP` y deja su línea de cierre: se escribe de forma **sincrónica** y **antes** de cancelar la
corrida, así que no gasta el margen que el sistema da antes de matar el proceso. En Windows ese margen
es de **5000 ms** (`SPI_GETHUNGAPPTIMEOUT`). La verificación corre
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


Los registros contienen identificadores de proceso y usuario, plataforma, versión de Node y salida de comandos.
No se implementa ocultación de datos sensibles en esas salidas; revísalos antes de compartirlos.
El archivo de versión propia se llama `self-check.json` y comparte el directorio de preferencias.
En Windows, el resumen también se escribe en `%LOCALAPPDATA%\tacuchi-updater\last-run-summary.json`.
Su retención no tiene una caducidad programada; se sobrescribe al llegar al resumen.
Las demás opciones y límites están en [ARCHITECTURE.md](../ARCHITECTURE.md#5-vista-de-despliegue).
