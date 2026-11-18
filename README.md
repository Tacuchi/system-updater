# @tacuchi/updater

> Interfaz de terminal para actualizar gestores de paquetes de macOS, Linux y Windows en un solo flujo.

TUI multiplataforma para actualizar **todos** los gestores de paquetes de tu sistema desde un solo flujo. macOS · Linux · Windows. Sin permisos de administrador (salvo los gestores que los exigen).

## Instalación

### Antes de instalar: lo que necesitas

Node.js >=18 y npm, según el manifiesto, y los gestores que quieras actualizar.
La interfaz con teclado requiere una terminal TTY; sin ella, el flujo se confirma automáticamente.

### Instalar el paquete

```sh
npm install -g @tacuchi/updater
```

También puedes ejecutarlo sin instalación global:

```bash
npx @tacuchi/updater          # ejecutar sin instalar
npx @tacuchi/updater --sudo   # macOS/Linux: relanzar con permisos de administrador
```

### Preparar una copia propia

No necesita configurar un servicio. Las preferencias se crean al necesitarlas por primera vez.
La guía de [preferencias y diagnóstico](docs/config-y-logs.md) explica cómo editarlas.

### Actualización

```sh
npm install -g @tacuchi/updater@latest
```

### Desinstalar

```sh
npm uninstall -g @tacuchi/updater
```

La desinstalación del paquete no incluye una rutina para retirar preferencias o registros.

### Plataformas

macOS, Linux y Windows. Cada descriptor declara dónde se ofrece y qué permisos necesita.
En Windows, `--sudo` no eleva: abre la terminal como Administrador o usa `E` en Confirmar.

## Uso

### Qué puedes recorrer

Detección con reintento, selección de paquetes, confirmación, actualización y resumen; incluye Ajustes y Detalle.
La cabecera reúne marca y paso; durante una corrida, Q y Esc preguntan antes de cancelar.
Ctrl+C cancela y sale de inmediato. La presentación adapta tema, glifos y pistas a la terminal.
La [guía de uso](docs/uso.md) conserva la lista de 27 gestores y explica los controles y límites.

### Comandos

```sh
updater
updater --sudo
updater --yes
updater --help
updater --version
```

`--yes`, `-y`, `--all` o una entrada sin TTY seleccionan y confirman automáticamente.
Con stdout redirigido, se escriben eventos y resumen por líneas, sin redibujo ni atajos.
Usa `updater --yes > resultado.txt` para seleccionar y confirmar al redirigir la salida.
Revisa el resumen: un estado indeterminado puede terminar con código de salida 0.

### Desarrollo y comprobaciones

La guía de [desarrollo](docs/desarrollo.md) conserva los comandos de instalación, pruebas y construcción.
La guía de [preferencias y diagnóstico](docs/config-y-logs.md) reúne configuración, registros y señales.

## Cómo funciona

Un proceso Node.js presenta la interfaz con React e Ink y coordina descriptores de gestores.
El motor ejecuta comandos locales y compara los pendientes antes y después de actualizar.
Preferencias y registros quedan en archivos locales; los gestores usan su propia configuración de red.

![Diagrama de contexto de system-updater](docs/architecture/context.svg)

El cuadro completo está en [ARCHITECTURE.md](ARCHITECTURE.md).

El script Python original se conserva en `legacy/updater_simple.py` como referencia histórica.

## Contribuir

Se aceptan issues y pull requests.
Para trabajar en el código, consulta [desarrollo](docs/desarrollo.md).

## Licencia

[MIT](LICENSE)
