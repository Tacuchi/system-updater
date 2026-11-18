# Guía de desarrollo

## Desarrollo

```bash
npm install
npm run dev        # ejecutar sin compilar (tsx)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/cli.js
```

La arquitectura (motor de ejecución, modelo de descriptores, máquina de estados) está documentada en [`CLAUDE.md`](../CLAUDE.md) y el sistema de diseño en [`docs/DESIGN.md`](DESIGN.md).


La vista general verificada está en [ARCHITECTURE.md](../ARCHITECTURE.md).
El manifiesto declara Node.js >=18; CI usa Node 20 y comprueba Linux, macOS y Windows.
Un push a `main` o una solicitud de cambios ejecuta CI sin excluir documentación.
La construcción genera `dist/cli.js`; el paquete distribuye `dist/` y conserva las dependencias externas.
El paso posterior comprueba la cabecera ejecutable. No hay publicación npm automática en CI.
No ejecutes una corrida real para comprobar documentación: las pruebas usan gestores simulados.
