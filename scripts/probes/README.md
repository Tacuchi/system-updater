# Sondas de terminal

Estas sondas no ejecutan la app ni gestores de paquetes.
Se ejecutan desde la raíz del checkout, fuera de `npm test`.

| Comando | Evidencia |
|---|---|
| `node scripts/probes/package-output.mjs` | Conteos de registros locales; nunca imprime su contenido. Admite un directorio como argumento. |
| `python3 scripts/probes/password-input.py` | Caracterización del comportamiento actual entre Ink y un hijo falso que lee `/dev/tty`. Solo envía bytes sintéticos. |
| `node scripts/probes/terminal-theme.mjs --fixtures` | Respuestas grabadas: claro, oscuro, DA1 y ausencia de respuesta. |
| `node scripts/probes/terminal-theme.mjs` | Consulta informativa a la terminal actual, con tope de 150 ms. |
| `node scripts/probes/header-width.mjs` | Combinaciones de idioma, paso y versión a 58 columnas útiles. |
| `node scripts/probes/terminal-image.mjs --fixtures` | Respuestas grabadas a la consulta de imágenes y bytes exactos de envío y borrado. |
| `node scripts/probes/terminal-image.mjs` | Consulta de imágenes a la terminal actual, con tope de 150 ms; `--write <archivo>` guarda el JSON. |
| `node scripts/probes/terminal-image.mjs --placement` | Comparación a la vista: colocación por cursor frente a marcadores Unicode tras un redibujo como el de Ink. |
| `npx tsx scripts/probes/banner-screens.tsx` | Revisión visual del banner: la cabecera real sobre pantallas simuladas, salida limpia. `--mode placeholders\|cursor\|sixel\|blocks\|ascii\|off` fuerza la forma; `--lang es\|en`; por omisión, el idioma configurado. |

La sonda de entrada requiere una pseudo-terminal Unix y Python 3.
`NODE_BINARY` permite indicar el ejecutable de Node si no está en PATH.
Los lectores pueden repartirse bytes de manera distinta entre corridas.
La sonda caracteriza esa contienda; no exige que un lector específico gane.
Resolverla requiere una decisión de alcance aparte.

## Banner

La cabecera elige la forma de la marca al inicio; el detalle está en `docs/DESIGN.md`.
Todas ocupan 6 × 3 celdas y dejan el texto en la misma columna.
Marcadores Unicode para Ghostty y kitty; colocación por cursor para otra terminal que responde a kitty, como Warp; sixel solo a pedido.
En las demás, medios bloques como texto: Terminal de macOS, Windows Terminal, la consola clásica, tmux y screen.
La forma ASCII solo con `TACUCHI_ASCII=1`.
Warp responde `OK` pero no dibuja marcadores: con ellos el hueco quedaba vacío.
El protocolo de kitty dice que borrar texto no afecta a las imágenes; borrar la pantalla sí.
Por eso la colocación por cursor reusa un identificador fijo de colocación, que mueve la imagen en vez de dejar un fantasma.
Tras un borrado de pantalla de Ink, las dos técnicas de kitty vuelven a enviar la imagen.
`--placement` muestra por qué un redibujo deja fantasma si cada frame crea una colocación nueva.

`banner-screens.tsx` recorre diez pantallas simuladas con cuerpos de distinta altura y termina como la app.
Al terminar imprime una línea que resume la forma usada y, si no hubo imagen, por qué.
Una es más alta que la terminal: la siguiente llega después de un borrado completo y la imagen debe volver.
Otra pide cambiar el tamaño de la ventana y dura cuatro pasos.
`--mode` fuerza la técnica como `TACUCHI_BANNER`; `--piece oscuro|claro|icono` fuerza la pieza; `--lang es|en` el idioma (por omisión, el configurado); `--step-ms` cambia el tiempo por pantalla.
`banner-screens.test.tsx` la recorre entera hasta la salida, con y sin respuesta, en cada forma; un error de render hace fallar la sonda con código 1.
No usa la máquina de estados ni gestores reales.
Sin respuesta a la consulta, dibuja los medios bloques y lo dice en el resumen.
En una ventana de menos de 60 columnas o 19 filas, usa la cabecera de una línea.

Una terminal de Herdr sin ventana responde DA1 pero no la consulta de imágenes; en un panel visible responde `OK` antes de DA1.
La imagen solo se ve a la vista; las pruebas comprueban bytes, alineación del texto y respaldos.

### Revisión a la vista

Un resultado correcto con imagen: Muesca junto a las tres líneas en cada pantalla, sin hueco vacío y sin copias.
Después de la pantalla más alta que la terminal, la imagen vuelve junto a la cabecera.
Al cambiar el tamaño, la imagen sigue a la cabecera o desaparece con ella si la ventana queda chica.
Al terminar, la última línea es la cabecera de una línea y no queda imagen en la pantalla.

Un resultado correcto con texto: tres líneas de 6 caracteres a la izquierda del texto, en cada pantalla.
El bloque va en el color del texto y solo las dos últimas celdas de la tercera línea, `▄█`, van en lima.
El texto empieza en la misma columna que con la imagen; al terminar queda la cabecera de una línea.
Con `NO_COLOR`, el mismo dibujo sin color. Con `--mode ascii`, `### _#` en la tercera línea.

| Terminal | Comando |
|---|---|
| Herdr, Ghostty, kitty | `npx tsx scripts/probes/banner-screens.tsx --mode placeholders` |
| Herdr (otra técnica), Warp, WezTerm | `npx tsx scripts/probes/banner-screens.tsx --mode cursor` |
| Terminal de macOS, cualquier terminal | `npx tsx scripts/probes/banner-screens.tsx --mode blocks` |
| Cualquier terminal, forma ASCII | `npx tsx scripts/probes/banner-screens.tsx --mode ascii` |
| Windows Terminal o consola clásica (PowerShell) | `npx tsx scripts/probes/banner-screens.tsx --mode blocks` |
| Windows Terminal con sixel (PowerShell) | `npx tsx scripts/probes/banner-screens.tsx --mode sixel` |

Sin `--mode`, la sonda elige como la app; en PowerShell, `$env:TACUCHI_BANNER='blocks'` tiene el mismo efecto que `--mode blocks`.

El reconocimiento fiable de paquetes se limita a las líneas de Homebrew observadas.
Los ejemplos de las pruebas están escritos a mano y no copian los registros.

Para el handoff, repetir la consulta de tema en otras terminales reales.
Repetir `TACUCHI_ASCII=1 npm test -- src/app.frames.test.tsx` en una consola Windows real.
En PowerShell: `$env:TACUCHI_ASCII='1'; npm test -- src/app.frames.test.tsx`.
Esas mediciones complementan las pruebas locales; no condicionan su cierre.
