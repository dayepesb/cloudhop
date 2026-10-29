---
title: Interfaz web
description: Administra portales, cuentas, alias y regiones desde una página web local.
---

¿Prefieres hacer clic en lugar de responder preguntas? Ejecuta:

```bash
cloudhop ui
```

cloudhop inicia un pequeño servidor web en tu computador y lo abre en tu
navegador. Todo lo que hagas ahí es igual que en la terminal: los alias que
crees en la página funcionan con `hop` de inmediato, y viceversa.

## Qué puedes hacer

- **Agregar una fuente.** Haz clic en **+ Add source**, elige un portal de
  empresa o una cuenta personal y llena el formulario. Se abre una pestaña
  del navegador para iniciar sesión. Si falla (por ejemplo, por un error en
  la URL), el formulario vuelve con lo que escribiste y el error, y no se
  guarda nada.
- **Crear alias.** **+ Aliases** lista todas las cuentas y roles de la
  fuente, con un filtro. Marca los que quieras y dale a cada uno un alias y
  una región. Las cuentas que ya tienen alias aparecen marcadas.
- **Cambiar una región.** Edítala en la tabla y presiona <kbd>Enter</kbd>.
- **Volver a iniciar sesión o sincronizar** una fuente con sus botones.
- **Eliminar** un alias (✕) o una fuente completa (**Remove**, pregunta
  antes).
- **Enseñarle cloudhop a tus asistentes de IA.** La sección *AI assistants*
  instala, actualiza o quita la skill y el servidor MCP de cloudhop en cada
  asistente, para ti o solo para el proyecto donde iniciaste `cloudhop ui`.
  Consulta [Asistentes de IA](/cloudhop/es/guides/ai-assistants/).

## Opciones

| Opción | Qué hace |
| --- | --- |
| `--port <n>` | Usa un puerto fijo en lugar de uno libre al azar. |
| `--no-open` | Imprime el enlace sin abrir el navegador. |

Presiona <kbd>Ctrl</kbd>+<kbd>C</kbd> en la terminal para detenerlo.

:::caution[No presiones Ctrl+Z]
<kbd>Ctrl</kbd>+<kbd>Z</kbd> pausa el servidor en lugar de detenerlo, y la
página deja de responder. La página te avisa cuando eso pasa; ejecuta `fg` en
la terminal para reanudarlo, o <kbd>Ctrl</kbd>+<kbd>C</kbd> y vuelve a
iniciarlo.
:::

## ¿Es seguro?

La página solo es accesible desde tu propio computador, y solo mediante el
enlace que imprime el comando. Ese enlace lleva una clave de un solo uso que
cambia cada vez que ejecutas `cloudhop ui`, así que otros sitios web no
pueden usarlo. La página nunca ve tus tokens de SSO ni tus credenciales de
AWS. Más en [Seguridad](/cloudhop/es/reference/security/).
