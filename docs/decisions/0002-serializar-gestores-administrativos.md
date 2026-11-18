---
status: accepted
date: 2026-11-18
---

# Serializar gestores con requisito de administrador

Motivo tomado del comentario de `runEngine` en `src/lib/exec/engine.ts`.

## Contexto y problema

Los gestores de sistema pueden competir por bloqueos de paquetes y solicitudes de contraseña.
El resto puede avanzar con concurrencia acotada.

## Opciones consideradas

- Ejecutar todas las tareas en el mismo grupo paralelo.
- Separar un carril serial de administradores y un grupo de tareas ordinarias.

## Resultado de la decisión

Opción elegida: Usar un carril serial para los gestores marcados `requiresAdmin`.
El comentario cita evitar bloqueos dpkg/rpm y solicitudes sudo intercaladas.

### Consecuencias

- El carril ordinario usa `concurrency`; el de administradores usa un solo puesto.
- Ambos carriles corren a la vez; esto no serializa la corrida completa.
