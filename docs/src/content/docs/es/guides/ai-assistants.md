---
title: Asistentes de IA
description: Enséñale cloudhop a Claude Code, Kiro, GitHub Copilot, Cursor o Codex una sola vez, en lugar de explicárselo en cada chat.
---

Tu asistente de IA puede ejecutar comandos en la nube por ti, pero de entrada
no conoce cloudhop: usa `aws --profile`, adivina cuentas o te pide que pegues
credenciales. Un comando se lo enseña para siempre:

```bash
cloudhop agent install
```

Eliges tus asistentes, dónde instalarlo, y listo. Desde ahí, en cualquier chat
nuevo, el asistente:

1. **Te pregunta qué alias usar** antes de su primer comando en la nube, con
   la lista real (alias, cuenta y rol, región). Nunca adivina. Si el
   proyecto tiene un [`.cloudhoprc`](/cloudhop/es/guides/shell/#fija-un-alias-a-una-carpeta-cloudhoprc),
   te ofrece ese alias primero, y aun así pregunta.
2. **Revisa la sesión primero.** Si tienes que iniciar sesión, te avisa que
   mires tu navegador en vez de fallar o reintentar en bucle.
3. **Ejecuta los comandos al estilo cloudhop:** `hop <alias> ...` para el AWS
   CLI y `cloudhop exec <alias> -- ...` para Terraform, CDK o scripts.
4. **Confirma antes de cambiar algo**, mostrando el alias, la cuenta, la región
   y el comando exacto, con cuidado extra en los alias de producción.
5. **Nunca toca credenciales**: nada de access keys, nada de imprimir secretos
   ni de editar `~/.aws`.

También aparece como último paso, opcional, de `cloudhop setup` y en la
sección **AI assistants** de [`cloudhop ui`](/cloudhop/es/guides/web-ui/).

## Qué se instala

Dos piezas; con `--no-mcp` dejas solo la primera:

- **Una skill**: instrucciones en el formato abierto Agent Skills
  (`SKILL.md`), que leen los cinco asistentes. Es el mismo texto para todos.
- **El servidor MCP de cloudhop** (`cloudhop mcp`): herramientas que el
  asistente puede llamar directamente. Se registra en la configuración MCP de
  cada asistente.

| Asistente | Skill (para ti / este proyecto) | Servidor MCP (para ti / este proyecto) |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/cloudhop/` · `.claude/skills/cloudhop/` | `claude mcp add --scope user` · `.mcp.json` |
| Kiro | `~/.kiro/skills/cloudhop/` · `.kiro/skills/cloudhop/` | `~/.kiro/settings/mcp.json` · `.kiro/settings/mcp.json` |
| GitHub Copilot (VS Code) | `~/.copilot/skills/cloudhop/` · `.github/skills/cloudhop/` | `code --add-mcp` · `.vscode/mcp.json` |
| Cursor | `~/.cursor/skills/cloudhop/` · `.cursor/skills/cloudhop/` | `~/.cursor/mcp.json` · `.cursor/mcp.json` |
| Codex | `~/.agents/skills/cloudhop/` · `.agents/skills/cloudhop/` | `~/.codex/config.toml` · `.codex/config.toml` |

cloudhop solo agrega su propia entrada: las demás skills y servidores MCP de
esos archivos quedan como estaban. Si un archivo de configuración tiene
comentarios (no es JSON puro), cloudhop no lo toca y te dice qué agregar a
mano.

**¿Para ti o para este proyecto?** Instálalo *para ti* para tenerlo en todos
lados. Instálalo *para este proyecto* para subirlo con el repositorio: todo tu
equipo recibe las mismas instrucciones al abrir el proyecto.

## Las herramientas MCP

| Herramienta | Qué hace | ¿Cambia algo? |
| --- | --- | --- |
| `list_aliases` | Fuentes y alias con el estado de su sesión, más el `.cloudhoprc` del proyecto y el alias que usa tu terminal, como pistas | No |
| `alias_status` | A qué cuenta apunta un alias y si puede ejecutarse ya | No |
| `whoami` | Le pregunta a la nube quién es realmente el alias | No |
| `open_console` | Abre la consola de AWS en tu navegador como el alias, con la sesión ya iniciada | No |
| `login` | Abre tu navegador para iniciar sesión y espera hasta 5 minutos | Inicia tu sesión |
| `run_cloud_cli` | Ejecuta el CLI de la nube como el alias (igual que `hop`) y devuelve su salida | **Puede**, por eso tu asistente te pregunta antes |

Las herramientas MCP nunca abren tu navegador por su cuenta: si una sesión
venció, lo dicen y el asistente te pregunta antes de llamar a `login`.
Rechazan `--profile` y nunca devuelven credenciales.

## Siempre al día

La skill viaja dentro del paquete de cloudhop, así que pasa por la misma
revisión, pruebas y publicación firmada que el código. Nunca se descargan
instrucciones de internet al momento de usarla.

- **Cuando actualizas cloudhop**, el siguiente comando `cloudhop` refresca
  todas las skills que instaló y te avisa en una línea. Si editaste una copia,
  cloudhop respeta tu versión; `cloudhop agent update --force` la reemplaza.
- **Una vez al día**, cloudhop revisa en npm si hay una versión nueva y te
  avisa (`npm i -g cloudhop`). Solo lee el número de versión. Lo apagas con
  `CLOUDHOP_NO_UPDATE_CHECK=1`; además está apagado en CI y sin terminal.

## Comandos

```bash
cloudhop agent                           # qué hay instalado, para ti y en este proyecto
cloudhop agent install                   # pregunta qué asistentes y dónde
cloudhop agent install --tools claude,kiro --scope project --no-mcp
cloudhop agent update [--force]          # refrescar las skills ahora
cloudhop agent remove [--tools codex] [--scope project]
```

Reinicia el asistente o abre un chat nuevo después de instalar para que cargue
la skill.

## Configuración manual

¿Prefieres hacerlo tú? Registra el servidor MCP con `cloudhop` como comando y
`mcp` como argumento, por ejemplo:

```json
{ "mcpServers": { "cloudhop": { "command": "cloudhop", "args": ["mcp"] } } }
```

El texto de la skill es el que escribe `cloudhop agent install`; cópialo de
cualquier `SKILL.md` instalado.

:::note
Si tu editor no encuentra el comando `cloudhop` al iniciar el servidor MCP
(pasa cuando lo abres desde el Dock y Node está en un gestor de versiones),
usa como comando la ruta completa que imprime `which cloudhop`.
:::
