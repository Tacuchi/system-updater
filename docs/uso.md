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

Con teclado: flechas o `j`/`k` recorren paquetes; espacio alterna la selección.
`A` selecciona todo, `N` limpia, `Enter` confirma y `S` abre preferencias.
`Q` sale y cancela una corrida activa; `Esc` cancela desde Actualizar.
Sin TTY o con `--yes`, `-y` o `--all`, el flujo selecciona y confirma automáticamente.
El modo automático termina con 1 si el contador de fallos es positivo; con 0 en otro caso.
Un estado indeterminado debe revisarse en el resumen y registro, aunque el código de salida sea 0.
