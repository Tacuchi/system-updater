---
status: accepted
date: 2026-11-18
---

# Conservar registros por cantidad de corridas

Motivo tomado del comentario inicial de `src/lib/log-retention.ts` y de `UserConfig` en `src/lib/config.ts`.

## Contexto y problema

Las corridas llegan en ráfagas y luego pueden pasar semanas sin actividad.
Una retención por días podría eliminar toda una sesión de diagnóstico.

## Opciones consideradas

- Conservar registros durante una ventana por antigüedad.
- Conservar las últimas corridas por cantidad.

## Resultado de la decisión

Opción elegida: Retener por cantidad de corridas, ordenadas por modificación.
El comentario explica que el patrón de ráfagas vuelve inadecuada una ventana por días.

### Consecuencias

- El valor inicial es 30; `logRetentionRuns` permite cambiarlo.
- La poda ocurre al inicializar el registro.
- Los rechazos de permisos se informan; el límite no garantiza retirar archivos inaccesibles.
