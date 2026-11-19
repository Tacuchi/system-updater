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
| `npx tsx scripts/probes/banner-screens.tsx` | Revisión visual del banner: la cabecera real sobre pantallas simuladas, salida limpia. `--lang es\|en`; por omisión, el idioma configurado. |

La sonda de entrada requiere una pseudo-terminal Unix y Python 3.
`NODE_BINARY` permite indicar el ejecutable de Node si no está en PATH.
Los lectores pueden repartirse bytes de manera distinta entre corridas.
La sonda caracteriza esa contienda; no exige que un lector específico gane.
Resolverla requiere una decisión de alcance aparte.

## Banner con imagen

La cabecera usa marcadores Unicode y no colocación por cursor.
El protocolo de kitty dice que borrar texto no afecta a las imágenes; borrar la pantalla sí.
Ink borra y reescribe líneas en cada frame: una imagen colocada por cursor quedaría como fantasma.
Con marcadores, la imagen es texto del frame y se mueve, desaparece y vuelve con él.
`--placement` muestra los dos casos con el mismo redibujo.

`banner-screens.tsx` recorre ocho pantallas simuladas con cuerpos de distinta altura y termina como la app.
`--piece oscuro|claro|icono` fuerza la pieza; `--lang es|en` el idioma (por omisión, el configurado); `--step-ms` cambia el tiempo por pantalla.
`banner-screens.test.tsx` la recorre entera hasta la salida, con y sin respuesta; un error de render hace fallar la sonda con código 1.
No usa la máquina de estados ni gestores reales.
Sin respuesta a la consulta, avisa el motivo y muestra la cabecera de una línea.

Una terminal de Herdr sin ventana responde DA1 pero no la consulta de imágenes; en un panel visible responde `OK` antes de DA1.
La imagen solo se ve a la vista; las pruebas comprueban bytes, alineación del texto y respaldos.

El reconocimiento fiable de paquetes se limita a las líneas de Homebrew observadas.
Los ejemplos de las pruebas están escritos a mano y no copian los registros.

Para el handoff, repetir la consulta de tema en otras terminales reales.
Repetir `TACUCHI_ASCII=1 npm test -- src/app.frames.test.tsx` en una consola Windows real.
En PowerShell: `$env:TACUCHI_ASCII='1'; npm test -- src/app.frames.test.tsx`.
Esas mediciones complementan las pruebas locales; no condicionan su cierre.
