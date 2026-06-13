# @tacuchi/updater

TUI multiplataforma para actualizar **todos** los gestores de paquetes de tu sistema desde un solo flujo. macOS · Linux · Windows. Sin permisos de administrador (salvo los gestores que los exigen).

```bash
npx @tacuchi/updater          # ejecutar sin instalar
npx @tacuchi/updater --sudo   # incluir gestores que requieren admin (apt, dnf, pacman, snap, choco)
```

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

Los gestores que requieren admin (apt, dnf, pacman, snap, choco) se actualizan con `--sudo`; sin permisos muestran el comando manual en vez de fallar en silencio.

## Desarrollo

```bash
npm install
npm run dev        # ejecutar sin compilar (tsx)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/cli.js
```

La arquitectura (motor de ejecución, modelo de descriptores, máquina de estados) está documentada en [`CLAUDE.md`](./CLAUDE.md) y el sistema de diseño en [`docs/DESIGN.md`](./docs/DESIGN.md).

## Config y logs

- Config: `~/.tacuchi-updater/config.json` (idioma, gestores habilitados, concurrencia, timeouts).
- Logs: `~/.tacuchi-updater/logs/` — registra cada comando ejecutado con su salida para diagnosticar fallos.

El script Python original se conserva en `legacy/updater_simple.py` como referencia histórica.

## Licencia

MIT
