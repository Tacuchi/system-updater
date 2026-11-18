---
status: accepted
date: 2026-11-18
---

# Verificar actualizaciones con pendientes posteriores

Motivo tomado de los comentarios de `src/lib/result/verify.ts` y `src/managers/engine.ts`.

## Contexto y problema

Un comando puede finalizar sin demostrar que los paquetes dejaron de estar pendientes.
Un listado posterior fallido tampoco demuestra que todo se actualizó.

## Opciones consideradas

- Decidir el éxito solo por el código de salida del comando.
- Comparar los pendientes anteriores y posteriores y conservar la incertidumbre.

## Resultado de la decisión

Opción elegida: Comparar pendientes mediante `reconcile`; si falta verificación posterior, devolver `unknown`.
Los comentarios explican que los descriptores no deben fabricar éxito.

### Consecuencias

- El resultado distingue paquetes actualizados, fallidos e indeterminados.
- Los casos especiales deben pasar evidencia de verificación a la reconciliación.
- El resultado depende de la calidad del listado y analizador de cada gestor.
