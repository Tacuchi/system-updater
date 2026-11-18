---
status: accepted
date: 2026-11-18
---

# Usar descriptores para facilitar nuevos gestores y compartir el motor

Motivo confirmado por la persona el 2026-11-18 durante la revisión de esta documentación.
Las opciones siguientes describen el contraste de diseño; no se afirma una evaluación histórica adicional.

## Contexto y problema

La aplicación integra gestores con comandos y formatos distintos.
Su ejecución y verificación necesitan un comportamiento compartido.

## Opciones consideradas

- Implementar ejecución y verificación independientes para cada gestor.
- Definir gestores mediante descriptores y adaptarlos con un motor compartido.

## Resultado de la decisión

Opción elegida: Usar un modelo declarativo para agregar gestores con facilidad y compartir la ejecución y la verificación.
La persona confirmó ese motivo en esta revisión.

### Consecuencias

- Cada descriptor declara plataforma, comandos y analizadores.
- El adaptador compartido aplica ejecución, registro y verificación genéricos.
- Los casos que no encajan en el modelo pueden implementar `escapeHatch`.
