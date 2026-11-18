---
status: accepted
date: 2026-11-18
---

# Consultar la versión propia sin bloquear la corrida

Motivo tomado del comentario inicial y la explicación de fallos de `src/lib/self-update.ts`.

## Contexto y problema

Una herramienta de actualización puede seguir usando una versión propia con errores ya corregidos.
La consulta de esa versión no debe detener el trabajo principal.

## Opciones consideradas

- No consultar la versión del updater.
- Consultar npm en segundo plano con caché y opción de desactivación.

## Resultado de la decisión

Opción elegida: Consultar npm sin bloquear, con caché de respuestas completadas durante 24 horas.
El comentario pide una comprobación poco intrusiva y fallos visibles solo en el registro.

### Consecuencias

- `selfCheck: false` evita la consulta.
- La petición tiene un plazo de 4000 ms.
- Una consulta fallida no actualiza la caché; la siguiente corrida puede reintentar.
- El aviso muestra cómo actualizar; no instala por sí mismo la versión nueva.
