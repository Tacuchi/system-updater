# Arquitectura de system-updater

Revisado el 2026-11-18 contra la versión 3.1.1 (commit `532d2a9`).

Este documento describe interfaz, motor, gestores, archivos locales, construcción y comprobaciones.
Excluye la implementación de herramientas externas y sus repositorios; todos los valores son los de por defecto.
Nada aquí se midió en una máquina concreta.

En resumen:

- Una persona reúne actualizaciones en una interfaz de terminal.
- Los gestores instalados trabajan como subprocesos del mismo sistema.
- Node.js consulta versiones en npm, Go y Flutter.
- Preferencias, caché y registros viven en archivos locales, sin base de datos.
- Sin verificación posterior válida, el camino genérico conserva `unknown`.

## 1. Propósito y metas de calidad

`@tacuchi/updater` permite detectar pendientes, seleccionar, confirmar, actualizar y revisar resultados.
La [guía de uso](docs/uso.md) enumera gestores, detección y controles.

Qué no es:

- No instala un servidor web ni un proceso permanente.
- No implementa los gestores: ejecuta herramientas instaladas y analiza respuestas.
- No garantiza limitar cada comando a los paquetes seleccionados; véanse los [límites de uso](docs/uso.md).

| Meta | Escenario |
|---|---|
| Resultado verificable | Compara pendientes previos y posteriores sin convertir una comprobación indeterminada en éxito. |
| Concurrencia controlada | Los gestores administrativos tienen un carril serial y los ordinarios comparten puestos. |
| Cierre auditable | El motor o una salida registra una sola terminación antes de cancelar por señal. |

CI comprueba tipos, pruebas y construcción en Linux, macOS y Windows.

## 2. Contexto y alcance

![Diagrama de contexto de system-updater](docs/architecture/context.svg)

[Versión interactiva](https://tacuchi.github.io/system-updater/architecture/context.html).

| Interfaz externa | Dirección | Cuándo ocurre |
|---|---|---|
| Persona y terminal | Entrada y salida local | Argumentos y teclado; tema e imágenes según terminal, progreso y resumen o salida por líneas. |
| Gestores instalados | Subprocesos locales | Detección, pendientes, actualización y verificación según plataforma. |
| Repositorios de gestores | Saliente desde cada gestor | Sus comandos consultan o descargan con destinos y credenciales propios. |
| Registro público npm | HTTPS saliente desde Node.js | Al arrancar, según preferencias y caché. |
| Versiones Go | HTTPS saliente desde Node.js | Al listar el gestor detectado y habilitado. |
| Versiones Flutter | HTTPS saliente desde Node.js | Al listar el gestor detectado y habilitado. |
| Sistema de permisos | Local | Unix relanza con `--sudo`; Windows detecta elevación y ofrece relanzar desde Confirmar. |

Las consultas propias son lecturas HTTP, sin envío del registro; véanse [destinos y cachés](docs/config-y-logs.md#consultas-y-privacidad).
La ausencia de telemetría propia no describe las herramientas externas.

## 3. Bloques de construcción

![Diagrama de contenedores de system-updater](docs/architecture/containers.svg)

[Versión interactiva](https://tacuchi.github.io/system-updater/architecture/containers.html).

Interfaz y motor comparten proceso Node.js; el diagrama separa subprocesos y archivos.
El registro conserva las detecciones indeterminadas sin presentarlas como disponibilidad confirmada.
La cabecera muestra el isotipo real con una de tres técnicas según la terminal: marcadores Unicode, colocación por cursor o sixel a pedido.
Si ninguna sirve, una línea con marca, versión y paso; `TACUCHI_BANNER` fuerza o apaga la técnica.
Pistas y atajos nacen de una tabla común.
Los tokens distinguen tema claro y oscuro; sin informe se usa oscuro.
El [mapa de módulos](docs/desarrollo.md#mapa-de-módulos) detalla responsabilidades y ubicaciones.

| Bloque | Responsabilidad |
|---|---|
| Entrada e interfaz | Lee argumentos e idioma, determina elevación, tema y modo; presenta pantallas o líneas según stdout. |
| Máquina de aplicación | Coordina detección, selección, motor, preferencias y cierre. |
| Registro y descriptores | Selecciona gestores compatibles y adapta comandos, analizadores y excepciones. |
| Motor de ejecución | Planifica tareas, ejecuta procesos y decodifica salida. |
| Reconciliación | Calcula resultados por paquete y gestor. |
| Persistencia y cierre | Conserva preferencias, diagnóstico y terminación de corridas. |
| Versión y construcción | Comprueba versiones y prepara la CLI distribuida. |

Reglas que no se rompen:

- El registro construye gestores solo desde descriptores compatibles con la plataforma actual.
- Una detección indeterminada permanece visible, sin escanearse ni actualizarse como disponible.
- El camino genérico usa `reconcile` sobre pendientes posteriores; sin listado válido no cuenta paquetes como actualizados.
- Los casos especiales `escapeHatch` preceden a la comprobación genérica de permisos; Go y Flutter tienen consultas propias.
- Go fuera de macOS se omite con enlace manual; en macOS delega en Homebrew.
- Un gestor genérico administrativo se omite sin elevación y muestra un comando manual.
- Los gestores `requiresAdmin` corren de uno en uno, simultáneamente con el otro carril.
- En Windows, `--sudo` no eleva: cuenta la elevación real de la consola.
- Una señal atendida escribe el cierre antes de cancelar y programar la salida.
- La primera terminación prevalece; llamadas posteriores no la reescriben.

Los carriles conservan los efectos y permisos reales de los gestores, sin aislar el sistema.

## 4. Vista de ejecución

Detectar y actualizar:

1. La CLI carga el idioma y procesa ayuda y versión; tras la elevación consulta tema e imágenes y elige salida según TTY.
2. La máquina lee preferencias, inicializa el registro y detecta gestores compatibles en paralelo.
3. Lista pendientes habilitados, conserva indeterminados y permite reintentar una detección fallida o volver a buscar.
4. La persona selecciona y confirma; el controlador lo hace automáticamente cuando corresponde.
5. Agrupa paquetes por gestor y entrega tareas al motor con cancelación y concurrencia configuradas.
6. Cada adaptador obtiene pendientes previos, ejecuta comandos y verifica después; la reconciliación calcula actualizados, fallidos o indeterminados para resumen y diagnóstico.
7. El motor cierra con su contabilidad; las pantallas o líneas presentan el resultado. Windows intenta guardar otro JSON.

Durante una corrida, Q y Esc preguntan antes de cancelar; Ctrl+C aborta inmediatamente.
La confirmación muestra qué gestores se detendrían y después indica cancelación en curso; los [controles y códigos](docs/uso.md#cancelación-y-salida) detallan sus variantes.
Con stdout redirigido se escriben eventos y resumen sin redibujo ni pistas de teclado.
La versión nueva aparece como número en cabecera y como comando en Resumen, sin bloquear el recorrido.

## 5. Vista de despliegue

| Qué | Por defecto | Cuándo aplica | Cómo cambiarlo |
|---|---|---|---|
| Comando distribuido | `updater` | Instalación global o ejecución npm | `bin` del manifiesto. |
| Construcción | ESM, objetivo Node 18 | Desarrollo y `prepublishOnly` | tsup y scripts del paquete. |
| Rutas locales | Por plataforma | Preferencias y registros | [Variables y rutas](docs/config-y-logs.md#config-y-logs). |
| Concurrencia | Cuatro puestos ordinarios | Actualizaciones sin requisito administrativo | `concurrency`. |
| Idioma | Español | Primera configuración | `language` en preferencias. |
| Modo automático | Entrada sin TTY | Ejecución sin teclado | [Opciones explícitas](docs/uso.md). |
| Comprobaciones | Linux, macOS y Windows | Push a `main` o solicitud de cambios | Workflow de CI. |

Los [límites y opciones](docs/config-y-logs.md#límites-y-opciones) explican plazos, retención, captura y valores adicionales.
Requiere npm, Node.js >=18 y gestores accesibles en `PATH`; la elevación depende del sistema operativo.
La distribución usa npm e incluye `LICENSE` con la licencia MIT.
Publicar un release dispara la publicación en npm desde CI, tras tipos y pruebas; no hay servicio, contenedor ni puerto de aplicación.
El [proceso de construcción](docs/desarrollo.md#construcción-y-comprobación) detalla herramientas y dependencias.

## 6. Conceptos transversales

Datos y privacidad:

| Pregunta | Respuesta |
|---|---|
| ¿Qué sale y adónde? | Solicitudes de versiones y tráfico de gestores hacia sus servicios, que reciben la petición y sus metadatos normales. |
| ¿Qué nunca sale? | El código propio no sube preferencias, caché o registros ni implementa telemetría. |
| ¿Cuándo ocurre? | Al arrancar, listar o ejecutar comandos según habilitación y caché. |
| ¿Dónde se guarda y cuánto? | Archivos locales con [retención y guardado](docs/config-y-logs.md#persistencia); la retención externa queda fuera del alcance. |
| ¿Cómo ver exactamente lo enviado? | El [registro](docs/config-y-logs.md#datos-del-diagnóstico) muestra comandos, sondeos, resultados y colas, sin capturar cada solicitud o cuerpo; no hay visor propio de red. |
| ¿Cómo se apaga? | [Preferencias de red](docs/config-y-logs.md#consultas-y-privacidad), cancelación o salida, sin interruptor global para procesos externos. |

El idioma configurado rige desde el primer frame, incluida la CLI.
El modo sin color conserva glifos y palabras; ASCII sustituye los glifos incompatibles.
Las [opciones de presentación](docs/config-y-logs.md#presentación-de-la-terminal) detallan tema, color y ancho.
Los gestores heredan su entorno y administran repositorios y credenciales.
Los [permisos y riesgos](docs/uso.md#permisos-y-riesgos) explican elevación y el caso Flutter.
Los [datos del diagnóstico](docs/config-y-logs.md#datos-del-diagnóstico) requieren revisión antes de compartirlos.
Cada herramienta externa conserva su política de red y almacenamiento.
El guardado y sus alternativas están en [persistencia](docs/config-y-logs.md#persistencia).
`logTailBytes` limita las colas de stdout/stderr en bytes UTF-8, también en implementaciones especiales.
El recorte conserva caracteres completos; los [detalles de captura](docs/config-y-logs.md#config-y-logs) explican su configuración.

## 7. Decisiones

Los siete registros permanecen en [docs/decisions/](docs/decisions/); estos cinco gobiernan ejecución y diagnóstico.

| Decisión | Registro |
|---|---|
| Verificar con pendientes posteriores | [0001](docs/decisions/0001-verificar-con-pendientes-posteriores.md) |
| Serializar gestores administrativos | [0002](docs/decisions/0002-serializar-gestores-administrativos.md) |
| Cerrar antes de cancelar por señal | [0003](docs/decisions/0003-cerrar-registro-antes-de-cancelar.md) |
| Retener por cantidad de corridas | [0004](docs/decisions/0004-retener-registros-por-cantidad.md) |
| Consultar la versión sin bloquear | [0005](docs/decisions/0005-consultar-version-sin-bloquear.md) |

Los registros 0001–0005 toman sus motivos de comentarios del código.
Las [decisiones de interfaz y extensión](docs/desarrollo.md#decisiones-y-contribuciones) conservan sus motivos y confirmaciones.

No registrado aún:

- Motivo de la concurrencia inicial y sus límites.
- Motivo de declarar Node.js >=18 mientras CI solo comprueba Node 20.

## Anexo: evidencia

Los números de línea refieren al commit `532d2a9`. El texto de arriba no enlaza al código a propósito.

| Sección | Evidencia |
|---|---|
| 1. Propósito | `package.json:4-15`, `src/app.tsx:14-35`, `src/managers/descriptors/index.ts:31-63`, `src/managers/registry.ts:14-22` |
| 1. Qué no es | `src/cli.tsx:97-108`, `src/managers/descriptors/go-lang.ts:64-85`, `src/managers/descriptors/apt.ts:36-40`, `src/lib/exec/run.ts:119-129`. La búsqueda de llamadas de escucha en el código propio no muestra un servidor. |
| 1. Metas | `src/lib/result/verify.ts:32-73`, `src/managers/engine.ts:213-218`, `src/lib/exec/engine.ts:95-114`, `src/lib/run-closure.ts:33-53`, `.github/workflows/ci.yml:9-43` |
| 2. Contexto | `src/cli.tsx:40-108`, `src/managers/registry.ts:14-41`, `src/lib/self-update.ts:83-91`, `src/managers/descriptors/go-lang.ts:23-33`, `src/managers/descriptors/flutter.ts:49-73` |
| 3. Bloques | `src/app.tsx:55-70`, `src/hooks/use-app-machine.tsx:145-161`, `src/managers/descriptor.ts:25-74`, `src/lib/exec/engine.ts:95-114`, `src/lib/logger.ts:31-78` |
| 3. Reglas | `src/managers/registry.ts:14-41`, `src/managers/engine.ts:204-218`, `src/managers/engine.ts:272-315`, `src/lib/result/verify.ts:50-73`, `src/lib/exec/engine.ts:101-114` |
| 4. Actualización | `src/cli.tsx:20-108`, `src/hooks/use-app-machine.tsx:171-227`, `src/hooks/use-app-machine.tsx:441-462`, `src/managers/engine.ts:221-291`, `src/lib/exec/engine.ts:101-114` |
| 4. Salida | `src/screens/update.tsx:82-85`, `src/hooks/use-app-machine.tsx:398-401`, `src/hooks/use-app-machine.tsx:509-519`, `src/lib/exec/run.ts:68-87`, `src/lib/signals.ts:80-90` |
| 5. Despliegue | `package.json:4-24`, `package.json:37-65`, `src/lib/config.ts:35-74`, `src/lib/config.ts:91-144`, `.github/workflows/ci.yml:3-43` |
| 6. Privacidad | `src/lib/self-update.ts:83-91`, `src/lib/self-update.ts:109-137`, `src/managers/descriptors/go-lang.ts:23-33`, `src/managers/descriptors/flutter.ts:49-73`, `src/lib/logger.ts:246-280`. La búsqueda de `fetch` y URL identifica esas consultas; no implementa subida de registros ni captura de red. |
| 6. Seguridad y persistencia | `src/cli.tsx:40-73`, `src/lib/exec/run.ts:19-42`, `src/lib/elevation.ts:27-63`, `src/lib/config.ts:134-175`, `src/lib/run-closure.ts:33-53` |
| 6. Colas de salida | `src/lib/config.ts:64-67`, `src/managers/engine.ts:78-85`, `src/managers/engine.ts:241-258`, `src/lib/exec/run.ts:45-53`, `src/managers/descriptors/winget.ts:93-101` |
| 7. Decisiones | `src/lib/result/verify.ts:32-36`, `src/lib/exec/engine.ts:95-99`, `src/lib/run-closure.ts:4-13`, `src/lib/log-retention.ts:4-14`, `src/lib/self-update.ts:6-13` |
| README y desarrollo | `package.json:4-24`, `package.json:37-65`, `src/cli.tsx:20-33`, `src/screens/select.tsx:36-46`, `.github/workflows/ci.yml:3-55` |
| 3. Presentación | `src/theme.ts:2-24`, `src/lib/terminal-theme.ts:42-74`, `src/components/step-header.tsx:13-16`, `src/screens/keys.tsx:8-44`, `src/components/line-output.tsx:5-27` |
| 3. Cabecera | `src/components/step-header.tsx:23-45`, `src/lib/terminal-image.ts:81-126`, `src/lib/banner-output.ts:51-70`, `src/cli.tsx:81-95`, `src/hooks/use-app-machine.tsx:413-419` |
| 5. Publicación | `.github/workflows/publish.yml:5-13`, `.github/workflows/publish.yml:32-42`, `package.json:23` |
| 4. Progreso | `src/screens/update.tsx:37-115`, `src/state/app-reducer.ts:127-165`, `src/hooks/use-app-machine.tsx:339-356`, `src/managers/descriptors/brew.ts:7-9`, `src/managers/engine.ts:239-258` |
| 6. Idioma y glifos | `src/hooks/use-app-machine.tsx:146-152`, `src/cli.tsx:20-33`, `src/lib/glyphs.ts:14-24`, `src/lib/display-counts.ts:1-25` |
