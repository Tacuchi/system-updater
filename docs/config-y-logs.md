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
| `language` | `es` | Idioma de la interfaz (`es` \| `en`), editable desde preferencias. |
| `enabledManagers` | `{}` | `enabledManagers[id]: false` desactiva desde configuración o preferencias; lo que no está, está habilitado. |
| `concurrency` | `4` | Puestos ordinarios entre 1 y 8; el carril administrativo siempre es serial. |
| `timeoutsMs` | `{}` | Espera máxima por gestor, en ms. |
| `logTailBytes` | `16384` | Campo declarado de configuración; el ejecutor usa un límite fijo de 16384 caracteres por salida y el motor no le pasa este campo. |
| `logRetentionRuns` | `30` | Corridas conservadas, mínimo 1, por **cantidad** y no por antigüedad, porque llegan en ráfagas. |
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


## Datos del diagnóstico

Los registros contienen PID, UID, `SUDO_USER`, plataforma, versión de Node y salida de comandos.
No se implementa ocultación de datos sensibles en esas salidas; revísalos antes de compartirlos.
Ver el tráfico exacto requiere inspección externa.

## Límites y opciones

- `verbosity: info` y `managers: {}` se conservan al normalizar la configuración.
- La ruta documentada usa `enabledManagers` y `timeoutsMs`; no se deduce un filtro de registro por `verbosity`.

### Plazos y captura

| Qué | Valor | Cómo se determina |
|---|---|---|
| Detección genérica | 5000 ms | Comando del descriptor. |
| Listado genérico | 30000 ms | Comando del descriptor. |
| Actualización genérica | 600000 ms | `timeoutsMs[id]` prevalece sobre el descriptor. |
| Homebrew | 1200000 ms | Valor del descriptor. |
| Actualización de Flutter | 600000 ms | Implementación especial; no usa el plazo configurado del adaptador genérico. |
| Consulta de versión propia | 4000 ms | Plazo de la petición GET. |
| Captura de actualización | 16384 caracteres por stdout/stderr | `tailBytes` del ejecutor de actualización. |

### Rutas adicionales

- Si faltan `APPDATA` o `LOCALAPPDATA`, Windows usa `~/AppData/Roaming` o `~/AppData/Local`, respectivamente.
- `TACUCHI_UPDATER_LOG_DIR` prevalece para el registro; en Unix, `logs/` queda bajo el directorio de configuración.
- Cada inicialización genera `system_updater_<marca-temporal>.log`, sin opción propia para cambiar el nombre.
- Al alcanzar Resumen en Windows se intenta sobrescribir `%LOCALAPPDATA%\tacuchi-updater\last-run-summary.json` con los resultados.
- Esa ruta interna recurre a `TEMP` o al directorio actual como respaldo; no usa las variables de preferencias y registros.

## Consultas y privacidad

- `selfCheck: false` evita la consulta propia a npm.
- La respuesta completada abre la ventana de caché; un fallo no la abre.
- Go consulta `https://go.dev/VERSION?m=text` una vez por proceso.
- Flutter consulta `storage.googleapis.com`, con manifiesto por plataforma y caché por proceso.
- Desactivar Go o Flutter evita sus listados y consultas de versión; la detección de comandos sigue ocurriendo.
- Los comandos de gestores pueden usar red incluso al listar pendientes.

## Persistencia

- Configuración y caché JSON no tienen borrado programado.
- El guardado intenta archivo temporal y renombrado; ciertos bloqueos de Windows permiten escritura directa.
- Si falla la lectura o escritura inicial de preferencias, se usan valores en memoria.
- Windows intenta copiar la configuración antigua cuando falta el destino; no migra los registros.
- La poda ordena archivos `.log` por modificación y no garantiza retirar los rechazados por permisos.
- `self-check.json` comparte el directorio de preferencias y conserva la fecha completada y la última versión conocida.
- Un fallo de consulta no actualiza esa fecha.
- El resumen Windows se sobrescribe sin caducidad programada.
- El cierre escribe sincrónicamente y cierra el descriptor; si no pudo abrirse el registro, es de mejor esfuerzo.
- No existe garantía ante terminación forzada ni protocolo de recuperación tras apagado.
