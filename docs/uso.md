# Guía de uso

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

En macOS y Linux, `--sudo` relanza la aplicación con permisos de administrador. En Windows necesitas una consola elevada. El adaptador genérico muestra el comando manual si no tiene los permisos requeridos.


El registro declara 27 descriptores; se filtran por sistema operativo y disponibilidad.
En Windows, `--sudo` no eleva: usa una terminal como Administrador o la opción `E` en Confirmar.
El código también marca `softwareupdate` y `go-lang` como gestores con requisito de administrador.
Go solo se actualiza automáticamente mediante Homebrew en macOS; Linux y Windows muestran una descarga manual.
Algunos gestores ejecutan operaciones globales aunque selecciones paquetes; revisa el comando del gestor.

## Pantallas y controles

En una terminal que responde al protocolo de imágenes de kitty, la cabecera muestra el isotipo junto a tres líneas: nombre y versión, plataforma y gestores detectados, y paso.
En las demás terminales, sin color, en modo ASCII, dentro de tmux o screen, o en una ventana de menos de 60 columnas o 19 filas, la cabecera reúne marca, versión y paso en una sola línea.
La salida redirigida nunca lleva imágenes.
Las pistas muestran las teclas disponibles y pasan a varias líneas cuando falta ancho.
El idioma configurado se aplica desde el inicio, incluida la ayuda de la CLI.

| Pantalla | Controles y resultado |
|---|---|
| Detectar | Un fallo muestra motivo y registro; `R` reintenta y `Q` sale. |
| Seleccionar | Flechas o `J`/`K` recorren; espacio marca, `A` marca todo y `N` limpia. `Enter` sigue; sin marcas, avisa. `S` abre Ajustes. |
| Confirmar | `Enter` o `Y` actualiza; `Esc` vuelve. `E` ofrece elevación cuando corresponde en Windows. Los gestores manuales aparecen aparte. |
| Actualizar | Muestra tiempo total, paquetes resueltos y tiempo por gestor; Homebrew puede indicar el paquete en curso. `Q` o `Esc` preguntan antes de cancelar. |
| Resumen | `R` vuelve a buscar; `D` abre el detalle cuando hay paquetes. Los fallos parciales se distinguen del éxito. |
| Detalle | Flechas o `J`/`K` recorren; `D` o `Esc` vuelven al resumen. |
| Ajustes | Flechas o `J`/`K` recorren gestores; espacio habilita o deshabilita, `L` cambia idioma y `Esc` vuelve. |

Fuera de Actualizar, `Q` sale. `Ctrl+C` cancela y sale inmediatamente desde cualquier pantalla.
Cuando todo está al día, `R` vuelve a buscar y `S` abre Ajustes.
La selección muestra cuántos paquetes están marcados sobre el total disponible.
El resumen conserva siempre el total actualizado; omite categorías vacías y nombra los resultados sin determinar.
Si se conoce una versión nueva, la cabecera muestra su número y el resumen ofrece el comando para instalarla.
La nota de contraseña solo aparece si algún gestor elegido puede solicitarla.

## Ejecución automática y salida redirigida

Sin entrada TTY, o con `--yes`, `-y` o `--all`, el flujo selecciona y confirma automáticamente.
Si stdout no es TTY, escribe líneas de eventos, un resultado por gestor y el resumen final.
Esa salida no lleva redibujo, controles de cursor ni pistas de teclado.
Para redirigir solo stdout, combina la redirección con `--yes`:

```sh
updater --yes > resultado.txt
```

El modo automático termina con 1 si hay fallos o falla la detección; con 0 en otro caso.
Un resultado sin determinar debe revisarse aunque el código de salida sea 0.
El registro completo conserva el diagnóstico en ambos modos.

## Cancelación y salida

Durante Actualizar, `Q` y `Esc` abren una pregunta que nombra los gestores que se detendrían.
La corrida continúa mientras respondes: `S` confirma en español y `Y` en inglés.
`N` o `Esc` vuelven sin cancelar; `Enter` no confirma.
Después de confirmar, las filas activas muestran que están cancelando hasta que termina el proceso.
La pregunta conserva el espacio reservado de las pistas.

`Ctrl+C` conserva la salida inmediata, sin pregunta.
La cancelación usa `AbortController`; los plazos también terminan el árbol de procesos, no solo el padre.
Una señal atendida programa la salida tras 200 ms de gracia, sin opción pública para cambiarla.
Los códigos de señal son 130 para cancelación, 143 para `SIGTERM` y 129 para `SIGHUP`.

## Permisos y riesgos

- En Unix, `--sudo` autentica antes de montar Ink.
- Los comandos sin requisito de elevación vuelven al usuario original cuando existe `SUDO_USER`.
- Windows comprueba la consola con `is-admin` y solicita UAC mediante PowerShell.
- El relanzamiento Windows informa si abrió la nueva consola, no el resultado de esa corrida.
- Su comentario mantiene pendiente validar argumentos y traspaso del resumen en Windows real.
- Flutter ejecuta `upgrade --force` desde su descriptor; puede afectar cambios locales de su instalación.
