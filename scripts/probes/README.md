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

La sonda de entrada requiere una pseudo-terminal Unix y Python 3.
`NODE_BINARY` permite indicar el ejecutable de Node si no está en PATH.
Los lectores pueden repartirse bytes de manera distinta entre corridas.
La sonda caracteriza esa contienda; no exige que un lector específico gane.
Resolverla requiere una decisión de alcance aparte.

El reconocimiento fiable de paquetes se limita a las líneas de Homebrew observadas.
Los ejemplos de las pruebas están escritos a mano y no copian los registros.

Para el handoff, repetir la consulta de tema en otras terminales reales.
Repetir `TACUCHI_ASCII=1 npm test -- src/app.frames.test.tsx` en una consola Windows real.
En PowerShell: `$env:TACUCHI_ASCII='1'; npm test -- src/app.frames.test.tsx`.
Esas mediciones complementan las pruebas locales; no condicionan su cierre.
