# Diseño de terminal

La interfaz guía detectar, seleccionar, confirmar y actualizar. Resumen, Detalle y Ajustes comparten la cabecera.

## Tokens

Los roles salen de `src/theme.ts`; las pantallas nombran roles, nunca hex.

| Rol | Oscuro | Claro |
|---|---|---|
| `text` | #e6e6e2 | #111111 |
| `muted` | #a3a39b | #5c5c56 |
| `action`, `success` | #bff278 | #111111 |
| `accentFill` | #bff278 | #bce489 |
| `logoFill` | #b6f23c | #b6f23c |
| `error` | #ffb4ab | #ffb4ab |
| `warning` | #ffade0 | #ffade0 |
| `unknown` | #f0b429 | #f0b429 |

En tema claro, la lima aparece como relleno. Texto y secundario superan 4,5:1 sobre blanco.
Se lee `COLORFGBG` antes de consultar OSC 11 y DA1. La espera máxima es 150 ms.
Sin informe, sin TTY o en modo automático, se elige oscuro.
Los colores de error, aviso e indeterminado conservan su contraste histórico.
Con `NO_COLOR`, cada estado conserva palabra y glifo.

## Estados y glifos

`src/lib/glyphs.ts` define ambos juegos. `TACUCHI_ASCII=1` fuerza el respaldo.
Las palabras se traducen según el idioma configurado desde el primer frame.

| Estado | Glifo | Respaldo | Palabra en español |
|---|---|---|---|
| pending, queued | `·` | `.` | PENDIENTE, EN COLA |
| scanning | `◌` | `o` | ESCANEANDO |
| outdated | `›` | `>` | DISPONIBLE |
| uptodate | `✓` | `+` | AL DÍA |
| running | `▸` | `>` | ACTUALIZANDO |
| cancelling | `▸` | `>` | CANCELANDO |
| done | `✓` | `+` | OK |
| partial | `!` | `!` | PARCIAL |
| failed | `✗` | `x` | ERROR |
| skipped | `⊘` | `-` | MANUAL |
| unknown | `?` | `?` | INDETERMINADO |

El cursor usa `❯` o `>`. La selección usa `[✓]` o `[x]`; sin marcar, `[ ]`.
Desplazamiento: `▲`/`▼` o `^`/`v`. Versiones: `→` o `->`.
Elipsis: `…` o `...`. Separador: `·` o `|`. Información: `ⓘ` o `i`.
Reinicio: `⟳` o `*`. El indicador animado usa `spinnerFrames` solo con una TTY compatible.

## Cabecera y espacio

La cabecera ocupa una línea: `tacuchi`, pieza, versión y paso actual.
La pieza usa `logo` con relleno `logoFill`. Sin color o en ASCII, se lee `tacuchi_`.
No hay barra de pasos ni identificador de plataforma.
La versión nueva aparece como número; su comando se muestra en Resumen.

El ancho máximo es 100 columnas. A 80 columnas los textos caben completos.
A 60 columnas las pistas pasan a varias líneas sin perder teclas.
La cabecera quita primero `updater`, luego `Paso`; finalmente acorta la etiqueta.
Conserva marca, versiones y número de paso. Las listas usan una ventana desplazable.
Las rutas usan `~` cuando corresponde y elipsis central cuando falta espacio.

## Teclado y salida

La tabla de `src/screens/keys.tsx` genera el manejo y las pistas: tecla, acción, separador.
Esc vuelve desde Confirmar, Ajustes y Detalle. R reintenta o vuelve a buscar.
Enter sin selección muestra un aviso. Los atajos J/K acompañan las flechas.
Q y Esc durante la corrida preguntan antes de cancelar. S confirma en español; Y en inglés.
N o Esc vuelven. Enter no confirma. Ctrl+C cancela de inmediato.
La pregunta ocupa el espacio reservado de pistas y conserva la altura.

Actualizar muestra tiempo total, paquetes resueltos y tiempo por gestor.
Homebrew puede informar el paquete en curso. La nota de contraseña aparece solo cuando aplica.
La contienda de lectores durante una contraseña se caracteriza con la sonda de entrada; resolverla queda fuera de este diseño.

Con stdout redirigido, `LineOutput` escribe eventos y resultados una sola vez, más el resumen final.
No hay redibujo ni pistas de teclado en esa salida.
