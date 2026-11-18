# Arquitectura de system-updater

Revisado el 2026-11-18 contra la versión 3.0.1 (commit `d078deb`).

Este documento describe la interfaz de terminal, el motor, los gestores y sus archivos locales.
Incluye construcción, distribución y comprobaciones; deja fuera la implementación de los gestores y sus repositorios.
Todos los valores son los de por defecto; nada aquí se midió en una máquina concreta.
Las llamadas de red realizadas por herramientas externas dependen de su propia configuración.

## 1. Propósito y metas de calidad

El paquete `@tacuchi/updater` reúne actualizaciones de gestores en un flujo de terminal.
Una persona puede detectar pendientes, seleccionar, confirmar, actualizar y revisar el resultado.
El registro contiene 27 descriptores; solo se ofrecen los compatibles con el sistema operativo.
La disponibilidad se determina ejecutando sus comandos de detección.

Qué no es:

- No instala un servidor web ni un proceso permanente.
- No implementa los gestores: ejecuta herramientas instaladas y analiza sus respuestas.
- No garantiza actualizar cada SDK automáticamente: Go fuera de macOS devuelve una descarga manual.
- No garantiza que la selección limite cada comando: algunos descriptores actualizan todo el gestor.
- No exige teclado: sin TTY, o con `--yes`, selecciona y confirma automáticamente.

| Meta | Escenario |
|---|---|
| Resultado verificable | El motor compara pendientes antes y después; si no obtiene la verificación, conserva `unknown`. |
| Permisos visibles | Un gestor ordinario con requisito de administrador se omite sin elevación y muestra un comando manual. Los casos especiales se explican en la sección 3. |
| Concurrencia controlada | Los gestores ordinarios comparten cuatro puestos; los que requieren administrador tienen un carril serial. |
| Cierre auditable | El motor o una ruta de salida escribe una sola terminación; una señal escribe antes de cancelar. |
| Portabilidad comprobada | CI comprueba tipos, pruebas y construcción en Linux, macOS y Windows. |

## 2. Contexto y alcance

![Diagrama de contexto de system-updater](docs/architecture/context.svg)

[Versión interactiva](https://tacuchi.github.io/system-updater/architecture/context.html).

| Interfaz externa | Dirección | Cuándo ocurre |
|---|---|---|
| Persona operadora y terminal | Entrada y salida local | Argumentos, teclado, progreso, detalle y resumen. Sin TTY, la confirmación es automática. |
| Gestores de paquetes instalados | Subprocesos locales | Detección, consulta de pendientes, actualización y verificación. Se filtran por plataforma. |
| Repositorios configurados en los gestores | Saliente desde cada gestor | Cuando sus comandos necesitan consultar o descargar paquetes; destinos y credenciales son ajenos al updater. |
| Registro público npm | HTTPS saliente desde Node.js | Con `selfCheck: true`, si falta una respuesta completada en las últimas 24 horas. Un fallo no abre esa ventana. |
| Servicio de versiones Go | HTTPS saliente desde Node.js | Al listar Go detectado y habilitado; consulta `https://go.dev/VERSION?m=text`, una vez por proceso. |
| Manifiesto de versiones Flutter | HTTPS saliente desde Node.js | Al listar Flutter detectado y habilitado; consulta `storage.googleapis.com`, con manifiesto distinto por plataforma y caché por proceso. |
| Sistema de permisos | Local: `sudo` o PowerShell/UAC | Unix relanza con `--sudo`; Windows detecta la consola elevada y ofrece relanzar desde Confirmar. |

No hay puerto de escucha declarado por la aplicación.
La distribución se realiza mediante npm; CI no publica el paquete automáticamente.
Las consultas propias de versión son lecturas HTTP, no envío del registro de corrida.
La ausencia de telemetría en el código propio no describe lo que hagan los gestores ejecutados.

## 3. Bloques de construcción

![Diagrama de contenedores de system-updater](docs/architecture/containers.svg)

[Versión interactiva](https://tacuchi.github.io/system-updater/architecture/containers.html).

Los bloques de interfaz y motor son módulos del mismo proceso Node.js.
Los gestores son procesos separados; preferencias y registros son archivos locales, sin base de datos.

| Bloque | Responsabilidad | Código |
|---|---|---|
| Entrada CLI | Lee argumentos, determina elevación y modo automático; registra señales. | `src/cli.tsx` |
| Interfaz de terminal | Muestra una pantalla por fase, cabecera y salida global. | `src/app.tsx`, `src/screens/`, `src/components/` |
| Máquina de aplicación | Coordina detección, selección, motor, preferencias y cierre. | `src/hooks/use-app-machine.tsx`, `src/state/` |
| Registro de gestores | Selecciona descriptores compatibles y conserva detecciones indeterminadas. | `src/managers/registry.ts`, `src/managers/descriptors/index.ts` |
| Descriptores y adaptación | Define comandos, analizadores y excepciones; crea cada gestor ejecutable. | `src/managers/descriptor.ts`, `src/managers/engine.ts`, `src/managers/descriptors/` |
| Planificación | Ejecuta tareas en un grupo acotado y un carril serial de administradores. | `src/lib/exec/engine.ts` |
| Ejecución y decodificación | Lanza procesos, decodifica salida y detiene árboles por cancelación o plazo. | `src/lib/exec/run.ts`, `src/lib/exec/decode.ts`, `src/lib/exec/kill-tree.ts`, `src/lib/executor.ts` |
| Reconciliación | Convierte comandos y pendientes posteriores en resultados por paquete y gestor. | `src/lib/result/` |
| Preferencias | Lee, normaliza y guarda configuración; determina rutas y migración de Windows. | `src/lib/config.ts` |
| Registro y cierre | Escribe diagnóstico, poda por cantidad y cierra una corrida una vez. | `src/lib/logger.ts`, `src/lib/log-retention.ts`, `src/lib/run-closure.ts`, `src/lib/signals.ts` |
| Versión propia | Consulta npm sin bloquear y guarda la respuesta completada. | `src/lib/self-update.ts` |
| Construcción y comprobación | Empaqueta la CLI, comprueba su cabecera y ejecuta la matriz de CI. | `tsup.config.ts`, `scripts/assert-shebang.mjs`, `.github/workflows/ci.yml` |

Reglas que no se rompen:

- El registro construye gestores solo desde descriptores compatibles con la plataforma actual.
- Una detección indeterminada permanece visible; no se escanea ni se actualiza como si estuviera disponible.
- En el camino genérico, los resultados de paquetes se obtienen con `reconcile` sobre el listado posterior.
- Sin listado posterior válido, ese camino devuelve `unknown`, sin contar paquetes como actualizados.
- Los gestores con `escapeHatch` implementan sus casos especiales: Go y Flutter consultan versiones propias.
- Go fuera de macOS se omite con enlace manual; en macOS delega en Homebrew.
- La comprobación genérica de permisos ocurre después de `escapeHatch`; no es una barrera universal para esos casos.
- Los gestores marcados `requiresAdmin` se planifican de uno en uno; el otro carril corre a la vez.
- En Windows, `--sudo` no eleva el proceso: se usa la elevación real de la consola.
- En una señal atendida, el cierre se escribe antes de cancelar y programar la salida.
- La primera terminación de una corrida prevalece; llamadas posteriores no la reescriben.

El diagrama distingue el proceso de aplicación, los subprocesos y los archivos de la máquina.
La separación de carriles no aísla el sistema: los gestores conservan sus efectos y permisos reales.

## 4. Vista de ejecución

Detectar y actualizar:

1. La CLI procesa ayuda y versión; si corresponde, relanza bajo `sudo` antes de montar Ink.
2. Determina elevación y si existe una entrada TTY; monta la interfaz con ambos valores.
3. La máquina lee configuración, inicializa el registro y detecta gestores compatibles en paralelo.
4. Lista pendientes de gestores disponibles y habilitados; presenta por separado los indeterminados.
5. En modo interactivo, la persona selecciona y confirma; en modo automático, el controlador hace ambos pasos.
6. Agrupa paquetes por gestor y entrega las tareas al motor con cancelación y concurrencia configuradas.
7. El carril ordinario y el serial de administradores ejecutan sus tareas simultáneamente.
8. El adaptador toma pendientes previos, ejecuta comandos y obtiene la verificación posterior.
9. La reconciliación calcula paquetes actualizados, fallidos o indeterminados; la máquina actualiza resumen y diagnóstico.
10. Al terminar, el motor cierra el registro con su contabilidad; no espera al renderizado del resumen.
11. En Windows, alcanzar Resumen intenta sobrescribir un archivo JSON adicional con los resultados.

Cancelar y salir:

1. `Esc` desde Actualizar aborta la corrida mediante `AbortController`; `Q` cancela y sale.
2. Una señal atendida declara el cierre, cancela procesos y programa la salida tras 200 ms.
3. La cancelación y el plazo de actualización terminan el árbol de procesos, no solo el padre.
4. El cierre es de mejor esfuerzo si no puede abrirse el registro; no existe garantía ante terminación forzada.
5. El código documenta que apagar, reiniciar o cerrar sesión en Windows puede terminar sin línea de cierre.

En modo automático, el código de salida es 1 si el contador de fallos es positivo; 0 en otro caso.
Ese código no demuestra que todos los gestores quedaran verificados: puede haber estados indeterminados.
Las señales usan 130 para cancelación, 143 para `SIGTERM` y 129 para `SIGHUP`.
La consulta de versión propia corre por separado y no bloquea estos recorridos.

## 5. Vista de despliegue

| Qué | Por defecto | Cuándo aplica | Cómo cambiarlo |
|---|---|---|---|
| Comando distribuido | `updater` apunta a `dist/cli.js` | Instalación global o ejecución npm | `bin` del manifiesto. |
| Construcción | `npm run build`: ESM, objetivo Node 18 y cabecera Node | Desarrollo y `prepublishOnly` | Configuración de tsup y scripts del paquete. |
| Dependencias | Externas al archivo generado; npm las instala | Paquete publicado | Dependencias del manifiesto y configuración de tsup. |
| Preferencias en macOS/Linux | `~/.tacuchi-updater/config.json` | Primera lectura de configuración | `TACUCHI_UPDATER_CONFIG_DIR` cambia el directorio. |
| Preferencias en Windows | `%APPDATA%\tacuchi-updater\Config\config.json` | Windows; copia inicial desde el directorio antiguo si procede | `TACUCHI_UPDATER_CONFIG_DIR`; si falta `APPDATA`, usa `~/AppData/Roaming`. |
| Registros en macOS/Linux | `logs/` bajo el directorio de configuración | Inicialización del registro | `TACUCHI_UPDATER_LOG_DIR` prevalece. |
| Registros en Windows | `%LOCALAPPDATA%\tacuchi-updater\Log\` | Inicialización del registro | `TACUCHI_UPDATER_LOG_DIR`; si falta `LOCALAPPDATA`, usa `~/AppData/Local`. |
| Nombre del registro | `system_updater_<marca-temporal>.log` | Cada inicialización | Generación interna del logger, sin opción propia. |
| Retención | 30 archivos de corrida, ordenados por modificación | Al abrir un nuevo registro | `logRetentionRuns`, mínimo 1, sin plazo por antigüedad. Los que no se pueden retirar se informan. |
| Idioma | `es` | Configuración inicial | `language`: `es` o `en`; pantalla de preferencias. |
| Habilitación | Todos los gestores compatibles | Ausencia de una entrada en `enabledManagers` | `enabledManagers[id]: false`; pantalla de preferencias. |
| Concurrencia | 4; se acota entre 1 y 8 | Carril sin requisito de administrador | `concurrency` en configuración. El carril de administradores siempre es serial. |
| Plazos genéricos | Detección 5000 ms, listado 30000 ms, actualización 600000 ms | Adaptador genérico | Comando del descriptor; actualización: `timeoutsMs[id]` antes que el valor del descriptor. |
| Plazos especiales | Homebrew: 1200000 ms; actualización de Flutter: 600000 ms | Esos descriptores | Valor del descriptor o implementación especial; Flutter no usa el plazo configurado del adaptador genérico. |
| Cola capturada de salida | 16384 caracteres por stdout/stderr | Ejecutor de actualización | `tailBytes` del ejecutor. `logTailBytes` existe en configuración, pero el motor no lo conecta al ejecutor. |
| Opciones declaradas adicionales | `verbosity: info`, `managers: {}` | Normalización de configuración | Se conservan al cargar; la ruta documentada usa `enabledManagers` y `timeoutsMs`. No se deduce un filtro de registro por `verbosity`. |
| Consulta de versión propia | `selfCheck: true`, GET con plazo de 4000 ms | Arranque; respuesta completada reutilizada durante 24 h | `selfCheck: false`; caché `self-check.json` junto a preferencias. Un fallo permite reintentar. |
| Resumen Windows | `%LOCALAPPDATA%\tacuchi-updater\last-run-summary.json` | Al alcanzar Resumen | Ruta interna; respaldo `TEMP` o directorio actual. No usa las dos variables de preferencias y registros. |
| Modo automático | Entrada sin TTY | Terminal redirigida o ejecución sin teclado | `--yes`, `-y` o `--all` también lo activan explícitamente. |
| Cierre por señal | 200 ms de gracia tras cierre y cancelación | Señal atendida | Constante interna, sin opción pública. |
| CI | Node 20, Python 3.12; Linux, macOS y Windows | Push a `main` o solicitud de cambios | Workflow; no excluye documentación ni contiene publicación npm. |

Requisitos: el manifiesto declara Node.js >=18 y npm para instalar el paquete.
Las versiones de dependencias son rangos del manifiesto; esa declaración no sustituye probar el runtime elegido.
Los gestores necesitan estar instalados y accesibles en `PATH`; la elevación depende del sistema operativo.
La construcción distribuye `dist/`; TypeScript, tsx y Vitest son herramientas de desarrollo.
No se declara un servicio, contenedor de despliegue ni puerto de aplicación.

## 6. Conceptos transversales

Datos y privacidad:

| Pregunta | Respuesta |
|---|---|
| ¿Qué sale de la máquina y adónde va? | Las lecturas HTTP propias consultan la versión del paquete en npm y manifiestos de Go/Flutter. El servicio recibe la solicitud de red y su metadato normal; los gestores contactan los destinos de su configuración. No hay envío propio del registro de corrida. |
| ¿Qué nunca sale de ella? | El código propio guarda preferencias, caché y registros en archivos locales; no implementa carga de esos archivos ni telemetría. Esta afirmación no se extiende a procesos externos ni sincronización del sistema. |
| ¿Cuándo ocurre? | Versión propia al arrancar si está habilitada y no hay caché vigente; Go/Flutter al listar gestores detectados y habilitados; red de gestores durante sus comandos, incluso listados. |
| ¿Dónde se guarda y por cuánto tiempo? | Configuración y caché JSON sin borrado programado; se reutiliza la respuesta de versión por 24 h. Registros: 30 corridas por defecto, poda al iniciar. Resumen Windows: un JSON sobrescrito sin caducidad programada. La retención externa no está definida aquí. |
| ¿Cómo ver exactamente lo enviado? | El registro muestra comandos, sondeos, resultados y colas de salida. No es una captura del tráfico: no contiene cada solicitud ni cuerpo enviado por gestores. No hay visor propio de red; se requiere inspección externa para ver el tráfico exacto. |
| ¿Cómo se apaga? | `selfCheck: false` evita la consulta propia a npm. Desactivar Go/Flutter en preferencias evita sus listados y consultas de versión; la detección de comandos sigue ocurriendo. Salir o cancelar detiene la corrida; no hay interruptor global de red para procesos externos. |

Seguridad:

- Los gestores heredan el entorno necesario para su ejecución; los repositorios y credenciales los administra cada herramienta.
- En Unix, `--sudo` autentica antes de Ink; los comandos sin requisito de elevación vuelven al usuario original cuando existe `SUDO_USER`.
- En Windows, la comprobación de administrador usa `is-admin`; el relanzamiento solicita UAC mediante PowerShell.
- El relanzamiento Windows devuelve si se abrió la nueva consola; no devuelve el resultado de esa corrida.
- El propio comentario del relanzamiento mantiene pendiente validar argumentos y traspaso del resumen en Windows real.
- Flutter ejecuta `upgrade --force`; puede afectar cambios locales en su instalación. El comando proviene de su descriptor.
- Los registros incluyen PID, UID, `SUDO_USER`, plataforma, versión de Node, comandos y salida capturada.
- El logger no aplica ocultación de datos sensibles a esas salidas; deben revisarse antes de compartirlas.

Persistencia:

- `config.json` se materializa al necesitarlo; si la lectura o escritura inicial falla, se usan valores en memoria.
- El guardado intenta archivo temporal y renombrado; ciertos bloqueos de Windows permiten escritura directa como alternativa.
- En Windows se intenta copiar la configuración antigua si no existe el destino; no migra los registros.
- La poda ordena `.log` por fecha de modificación; informa rechazos de permisos sin asegurar que se retiró el archivo.
- `self-check.json` conserva fecha de consulta completada y última versión conocida; un fallo no actualiza esa fecha.
- El cierre escribe sincrónicamente y cierra el descriptor una sola vez; no equivale a un protocolo de recuperación tras apagado.

## 7. Decisiones

| Decisión | Registro |
|---|---|
| Verificar actualizaciones con pendientes posteriores | [0001](docs/decisions/0001-verificar-con-pendientes-posteriores.md) |
| Serializar gestores con requisito de administrador | [0002](docs/decisions/0002-serializar-gestores-administrativos.md) |
| Cerrar el registro antes de cancelar por señal | [0003](docs/decisions/0003-cerrar-registro-antes-de-cancelar.md) |
| Conservar registros por cantidad de corridas | [0004](docs/decisions/0004-retener-registros-por-cantidad.md) |
| Consultar la versión propia sin bloquear | [0005](docs/decisions/0005-consultar-version-sin-bloquear.md) |
| Reutilizar componentes y estado con React, Ink y TypeScript | [0006](docs/decisions/0006-reutilizar-componentes-y-estado-en-terminal.md) |
| Facilitar nuevos gestores y compartir ejecución y verificación | [0007](docs/decisions/0007-compartir-ejecucion-y-verificacion-con-descriptores.md) |

Los registros 0001–0005 toman sus motivos de comentarios del código.
Los motivos de 0006 y 0007 fueron confirmados por la persona el 2026-11-18.
La misma revisión confirmó que se aceptan issues y pull requests.

No registrado aún (Not recorded yet):

- Motivo del valor inicial de concurrencia 4 y de los límites 1..8.
- Motivo de declarar Node.js >=18 mientras CI solo comprueba Node 20.

## Anexo: evidencia

Los números de línea refieren al commit `d078deb`. El texto de arriba no enlaza al código a propósito.

| Sección | Evidencia |
|---|---|
| 1. Propósito | `package.json:2-16`, `src/app.tsx:40-61`, `src/managers/descriptors/index.ts:31-63`, `src/managers/registry.ts:14-22` |
| 1. Qué no es | `src/cli.tsx:81-87`, `src/managers/descriptors/go-lang.ts:64-85`, `src/managers/descriptors/apt.ts:36-40`, `src/lib/exec/run.ts:115-125`. La búsqueda de llamadas de escucha en el código propio no muestra un servidor. |
| 1. Metas | `src/lib/result/verify.ts:32-73`, `src/managers/engine.ts:211-216`, `src/lib/exec/engine.ts:95-114`, `src/lib/run-closure.ts:33-53`, `.github/workflows/ci.yml:9-43` |
| 2. Contexto | `src/cli.tsx:11-29`, `src/cli.tsx:42-87`, `src/managers/registry.ts:14-41`, `src/hooks/use-app-machine.tsx:172-195`, `src/managers/descriptors/apt.ts:36-40`, `src/lib/self-update.ts:83-91`, `src/lib/self-update.ts:109-137`, `src/managers/descriptors/go-lang.ts:23-33`, `src/managers/descriptors/flutter.ts:49-73` |
| 3. Bloques | `src/app.tsx:1-13`, `src/app.tsx:80-92`, `src/hooks/use-app-machine.tsx:144-160`, `src/managers/descriptor.ts:23-71`, `src/managers/engine.ts:71-96`, `src/lib/exec/engine.ts:95-114`, `src/lib/exec/run.ts:115-125`, `src/lib/executor.ts:36-60`, `src/lib/logger.ts:31-78`, `src/lib/self-update.ts:58-98`, `tsup.config.ts:3-18` |
| 3. Reglas | `src/managers/registry.ts:14-41`, `src/hooks/use-app-machine.tsx:172-184`, `src/managers/engine.ts:202-216`, `src/managers/engine.ts:263-306`, `src/lib/result/verify.ts:50-73`, `src/managers/descriptors/go-lang.ts:64-85`, `src/lib/exec/engine.ts:101-114`, `src/cli.tsx:69-85`, `src/lib/signals.ts:80-90`, `src/lib/run-closure.ts:33-53` |
| 4. Actualización | `src/cli.tsx:15-87`, `src/hooks/use-app-machine.tsx:155-225`, `src/hooks/use-app-machine.tsx:235-250`, `src/hooks/use-app-machine.tsx:369-393`, `src/hooks/use-app-machine.tsx:432-468`, `src/managers/engine.ts:219-281`, `src/lib/exec/engine.ts:101-114` |
| 4. Salida | `src/screens/update.tsx:89-94`, `src/hooks/use-app-machine.tsx:396-398`, `src/hooks/use-app-machine.tsx:412-442`, `src/hooks/use-app-machine.tsx:489-507`, `src/lib/exec/run.ts:64-83`, `src/lib/signals.ts:15-22`, `src/lib/signals.ts:31-51`, `src/lib/signals.ts:80-90` |
| 5. Despliegue | `package.json:2-22`, `package.json:35-56`, `tsup.config.ts:3-18`, `src/lib/config.ts:35-72`, `src/lib/config.ts:91-144`, `src/lib/config.ts:208-212`, `src/lib/logger.ts:43-76`, `src/lib/log-retention.ts:54-94`, `src/managers/engine.ts:33-38`, `src/managers/engine.ts:85-88`, `src/managers/engine.ts:175-177`, `src/managers/engine.ts:239-245`, `src/managers/descriptors/brew.ts:35-43`, `src/managers/descriptors/flutter.ts:109-119`, `src/lib/exec/run.ts:7-16`, `src/lib/exec/run.ts:120-124`, `src/lib/self-update.ts:58-86`, `src/lib/self-update.ts:109-137`, `src/lib/elevation.ts:27-35`, `src/cli.tsx:81-85`, `.github/workflows/ci.yml:3-43` |
| 6. Privacidad | `src/lib/self-update.ts:83-91`, `src/lib/self-update.ts:109-137`, `src/managers/descriptors/go-lang.ts:23-33`, `src/managers/descriptors/flutter.ts:49-73`, `src/hooks/use-app-machine.tsx:172-195`, `src/lib/logger.ts:68-74`, `src/lib/logger.ts:246-280`, `src/lib/logger.ts:164-171`, `src/lib/exec/run.ts:156-163`. La búsqueda de `fetch` y URL en código propio identifica esas consultas; no implementa subida de registros ni captura de red. |
| 6. Seguridad y persistencia | `src/cli.tsx:42-79`, `src/lib/exec/run.ts:19-42`, `src/lib/elevation.ts:5-24`, `src/lib/elevation.ts:27-63`, `src/managers/descriptors/flutter.ts:115-119`, `src/lib/config.ts:134-175`, `src/lib/config.ts:179-205`, `src/lib/logger.ts:22-34`, `src/lib/log-retention.ts:69-94`, `src/lib/self-update.ts:58-80`, `src/hooks/use-app-machine.tsx:455-468`, `src/lib/run-closure.ts:33-53` |
| 7. Decisiones | `src/lib/result/verify.ts:32-36`, `src/lib/exec/engine.ts:95-99`, `src/lib/logger.ts:22-29`, `src/lib/signals.ts:62-78`, `src/lib/run-closure.ts:4-13`, `src/lib/log-retention.ts:4-14`, `src/lib/self-update.ts:6-13`, `package.json:12-13`, `package.json:37-55`, `src/lib/config.ts:35-52`, `src/managers/descriptor.ts:23-71`, `.github/workflows/ci.yml:19-22`. Los motivos de 0006 y 0007 y la política de contribución fueron confirmados por la persona el 2026-11-18. |
| README y desarrollo | `package.json:2-22`, `package.json:36-56`, `src/managers/descriptors/index.ts:31-63`, `src/cli.tsx:11-39`, `src/cli.tsx:69-85`, `src/screens/select.tsx:36-46`, `src/screens/confirm.tsx:21-29`, `src/hooks/use-app-machine.tsx:432-442`, `src/managers/descriptors/go-lang.ts:64-85`, `.github/workflows/ci.yml:3-55` |
