---
status: accepted
date: 2026-11-18
---

# Cerrar el registro antes de cancelar por señal

Motivo tomado de comentarios de `src/lib/logger.ts`, `src/lib/run-closure.ts` y `src/lib/signals.ts`.

## Contexto y problema

Un flujo de escritura con búfer puede perder su cola al salir.
Un cierre ligado al renderizado del resumen depende de alcanzar esa pantalla.
Cancelar un árbol crea procesos y consume parte del margen de salida.

## Opciones consideradas

- Cerrar desde un efecto de la pantalla Resumen y una escritura con búfer.
- Cerrar sincrónicamente desde el ciclo de vida de la corrida, antes de cancelar por señal.

## Resultado de la decisión

Opción elegida: Escribir el cierre sincrónicamente una sola vez; ante una señal, hacerlo antes de cancelar.
Los comentarios señalan la pérdida de colas y el margen limitado al cerrar una consola.

### Consecuencias

- La primera terminación prevalece sobre posteriores llamadas.
- El cierre lee la contabilidad del motor, sin depender del renderizado.
- No asegura una línea final ante apagado, terminación forzada o un registro que no pudo abrirse.
