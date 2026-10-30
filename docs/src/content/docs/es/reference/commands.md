---
title: Comandos
description: Todos los comandos y opciones de cloudhop.
---

`cloudhop` y `hop` son el mismo programa. Usa `hop` para el trabajo diario y
`cloudhop` para la configuración; ambos aceptan todos los comandos.

## Ejecutar como un alias

### `hop <alias> [args...]`

Ejecuta el AWS CLI como el alias: `hop acme-prod s3 ls` ejecuta `aws s3 ls`
con el perfil y la región del alias. Sin argumentos, ejecuta
`aws sts get-caller-identity`, que muestra quién eres.

- Primero inicia sesión si la sesión venció, y reintenta una vez si el AWS
  CLI reporta una sesión vencida.
- Todo lo que va después del alias pasa a `aws` sin cambios, incluidos
  `--region` y `--output`.
- Ignora `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN`
  de tu shell, que de otro modo tendrían prioridad sobre el perfil.
- Devuelve el código de salida de `aws`.

### `hop` y `hop - [args...]`

Sin alias, `hop` te deja elegirlo de una lista (escribe para filtrar) y luego
te pide el comando. `hop - s3 ls` te deja elegir el alias y ejecuta
`aws s3 ls`.

### `cloudhop console [alias] [service] [--region <r>]`

Abre la consola de AWS como el alias, con la sesión ya iniciada. Consulta
[Abre la consola de AWS](/cloudhop/es/guides/console/).

### `cloudhop each <selection...> [--source <s>] [--prod|--no-prod] [--parallel <n>] [--yes] [--json] -- <args...>`

Ejecuta un mismo comando de `aws` en muchos alias. Consulta
[Ejecuta en muchas cuentas](/cloudhop/es/guides/many-accounts/).

### `cloudhop exec <alias> [--region <r>] -- <command...>`

Ejecuta cualquier comando con las credenciales temporales del alias en su
entorno (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
`AWS_REGION`, `AWS_DEFAULT_REGION`). Devuelve el código de salida del
comando. Consulta
[Uso con otras herramientas](/cloudhop/es/guides/other-tools/).

## Configuración

| Comando | Qué hace |
| --- | --- |
| `cloudhop setup` | Primer uso guiado: elige nubes, verifica el AWS CLI, agrega una fuente. Requiere una terminal. |
| `cloudhop add` | Agrega un portal SSO o una cuenta personal, inicia sesión y crea alias. |
| `cloudhop add aws sso --start-url <url> [--region <r>] [--name <id>]` | Lo mismo, sin preguntas. |
| `cloudhop add aws console-login [--region <r>] [--name <id>]` | Agrega una cuenta personal sin preguntas. |
| `cloudhop ui [--port <n>] [--no-open]` | Lo mismo, desde una [página web local](/cloudhop/es/guides/web-ui/). |

## Alias

| Comando | Qué hace |
| --- | --- |
| `cloudhop alias [source]` | Elige más cuentas y roles de una fuente y ponles nombre. |
| `cloudhop alias <source> --list` | Imprime las cuentas y roles de la fuente con sus ids. |
| `cloudhop alias <source> --target <id> [--name <alias>] [--region <r>]` | Crea un alias sin preguntas. |
| `cloudhop region <alias> [region]` | Cambia la región de un alias (pregunta si no la indicas). |
| `cloudhop mv <alias> <new-name>` | Cambia el nombre de un alias (y de su perfil de AWS). |
| `cloudhop prod [alias...] [--off]` | Marca alias como de producción, o los lista. Consulta [Protege producción](/cloudhop/es/guides/production/). |
| `cloudhop rm <name...> [--yes]` | Elimina alias, o fuentes con sus alias. Eliminar una fuente pregunta antes; `--yes` omite la pregunta. |
| `cloudhop rm --source <id>` | Elimina una fuente cuando un alias tiene el mismo nombre. |
| `cloudhop ls [source] [--json]` | Lista las fuentes con el estado de su sesión y sus alias. `--json` imprime los mismos datos para scripts y asistentes de IA. |
| `cloudhop status [alias] [--json]` | Qué alias usa esta terminal, y si un alias (o cada fuente) puede ejecutarse ya, se renueva en silencio o necesita iniciar sesión en el navegador. Nunca inicia sesión por sí solo. |

## Sesiones

| Comando | Qué hace |
| --- | --- |
| `cloudhop login [source]` | Vuelve a iniciar sesión ahora y actualiza las cuentas y roles de la fuente. |
| `cloudhop sync [source]` | Actualiza las cuentas y roles de una fuente o de todas. |

## Tu terminal

| Comando | Qué hace |
| --- | --- |
| `cloudhop use [alias]` | Cambia esta terminal a un alias: después `aws`, Terraform y los SDKs normales corren como él. Sin la integración con la shell abre una shell nueva. Consulta [Usa un alias en tu terminal](/cloudhop/es/guides/shell/). |
| `cloudhop use <alias> --save` | Lo mismo, y lo fija a esta carpeta en un `.cloudhoprc` (confiable para ti). |
| `cloudhop use --off [nube]` | Deja de usar el alias de todas las nubes, o de una (`aws`). |
| `cloudhop use <alias> --default` | Lo mismo, y cada terminal nueva arranca con él. Un alias de producción también necesita `--yes`. |
| `cloudhop use --no-default [nube]` | Las terminales nuevas vuelven a arrancar sin alias (de todas las nubes, o de una). |
| `cloudhop allow [carpeta]` / `cloudhop deny [carpeta]` | Confía (o deja de confiar) en el `.cloudhoprc` de una carpeta, para que `cd` cambie a sus alias. |
| `cloudhop shell` | Configura tu terminal una vez: agrega una línea al archivo de inicio de tu shell y, si usas Starship, el segmento del alias a `starship.toml` (igual que `cloudhop shell install`). |
| `cloudhop shell zsh\|bash\|fish\|pwsh` | Imprime el script de la integración; esa línea lo ejecuta. |
| `cloudhop shell starship` | Imprime los segmentos de prompt para [Starship](https://starship.rs). |

## Equipo

| Comando | Qué hace |
| --- | --- |
| `cloudhop team export [--sources <list>] [--out <file>]` | Exporta portales y alias para tu equipo (sin secretos). |
| `cloudhop team import <file\|https URL> [--yes]` | Importa la configuración de un equipo. Consulta [Comparte con tu equipo](/cloudhop/es/guides/team/). |

## Asistentes de IA

| Comando | Qué hace |
| --- | --- |
| `cloudhop agent [status]` | Qué asistentes tienen la skill y el servidor MCP de cloudhop, para ti y en este proyecto. |
| `cloudhop agent install [--tools <lista>] [--scope user\|project] [--no-mcp]` | Enséñale cloudhop a Claude Code, Kiro, Copilot, Cursor o Codex. Consulta [Asistentes de IA](/cloudhop/es/guides/ai-assistants/). |
| `cloudhop agent update [--force]` | Refresca ahora las skills instaladas (`--force` también reemplaza las copias que editaste). |
| `cloudhop agent remove [--tools <lista>] [--scope user\|project]` | Quita la skill y la entrada del servidor MCP. |
| `cloudhop mcp` | El servidor Model Context Protocol (stdio) que los asistentes inician por ti. |

## Nubes y herramientas

| Comando | Qué hace |
| --- | --- |
| `cloudhop provider ls` | Lista las nubes que soporta cloudhop y cuáles están activadas. |
| `cloudhop provider enable <id>` / `disable <id>` | Activa o desactiva una nube (hoy, `aws`). |
| `cloudhop doctor` | Verifica que el CLI de cada nube activada esté instalado y sea lo bastante reciente, y ofrece instalarlo. |

## Opciones globales

| Opción | Qué hace |
| --- | --- |
| `--device-code` | Inicia sesión con un código que confirmas en cualquier dispositivo, en lugar de la redirección del navegador. Útil por SSH. |
| `-v`, `--version` | Imprime la versión. |
| `-h`, `--help` | Imprime la ayuda. |

## Variables de entorno

| Variable | Qué hace |
| --- | --- |
| `CLOUDHOP_HOME` | Dónde guarda cloudhop su configuración. Por defecto `~/.config/cloudhop` (o `$XDG_CONFIG_HOME/cloudhop`). |
| `CLOUDHOP_AWS_DIR` | La carpeta de AWS que se usa en lugar de `~/.aws`. Útil para pruebas. |
| `CLOUDHOP_DEVICE_CODE=1` | Siempre inicia sesión con un código de dispositivo. |
| `CLOUDHOP_DEBUG=1` | Imprime los detalles completos de los errores. |
| `CLOUDHOP_CONFIRM_PROD=1` | Una persona aprobó este cambio en un alias de producción; no preguntes (para scripts y asistentes de IA). |
| `CLOUDHOP_NO_UPDATE_CHECK=1` | No revisa en npm si hay una versión nueva (también está apagado en CI y sin terminal). |
| `CLOUDHOP_WRAP=0` | Con la integración con la shell, `aws` sigue siendo el AWS CLI normal aunque uses un alias. |
| `CLOUDHOP_AUTO_USE=0` | Con la integración con la shell, `cd` no cambia de alias por archivos `.cloudhoprc`. |
| `CLOUDHOP_PROMPT=0` | Con la integración con la shell, no agrega la etiqueta del alias al prompt. |

`cloudhop use` define `CLOUDHOP_AWS_ALIAS`, `CLOUDHOP_AWS_PROMPT` y
`CLOUDHOP_AWS_PROD` para tu prompt; consulta
[Usa un alias en tu terminal](/cloudhop/es/guides/shell/#mira-el-alias-en-tu-prompt).
