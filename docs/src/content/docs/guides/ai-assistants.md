---
title: AI assistants
description: Teach Claude Code, Kiro, GitHub Copilot, Cursor or Codex to use cloudhop, once, instead of explaining it in every chat.
---

Your AI coding assistant can run cloud commands for you, but out of the box it
doesn't know cloudhop: it reaches for `aws --profile`, guesses accounts, or
asks you to paste credentials. One command teaches it, for good:

```bash
cloudhop agent install
```

Pick your assistants, choose where to install, and you're done. From then on,
in any new chat, the assistant:

1. **Asks which alias to use** before its first cloud command, showing you the
   real list (alias, account and role, region). It never guesses.
2. **Checks the session first.** If you need to sign in, it tells you to look
   at your browser instead of failing or retrying in a loop.
3. **Runs commands the cloudhop way:** `hop <alias> ...` for the AWS CLI and
   `cloudhop exec <alias> -- ...` for Terraform, CDK or scripts.
4. **Confirms before changing anything**, showing the alias, account, region
   and exact command, and takes extra care with production aliases.
5. **Never touches credentials**: no access keys, no printing secrets, no
   editing `~/.aws`.

It also appears as the last, optional step of `cloudhop setup`, and in the
**AI assistants** section of [`cloudhop ui`](/cloudhop/guides/web-ui/).

## What gets installed

Two pieces, and you can keep just the first one with `--no-mcp`:

- **A skill**: instructions in the open Agent Skills format (`SKILL.md`),
  which all five assistants read. It is the same text for every assistant.
- **The cloudhop MCP server** (`cloudhop mcp`): tools the assistant can call
  directly. It is registered in each assistant's MCP settings.

| Assistant | Skill (for you / this project) | MCP server (for you / this project) |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/cloudhop/` · `.claude/skills/cloudhop/` | `claude mcp add --scope user` · `.mcp.json` |
| Kiro | `~/.kiro/skills/cloudhop/` · `.kiro/skills/cloudhop/` | `~/.kiro/settings/mcp.json` · `.kiro/settings/mcp.json` |
| GitHub Copilot (VS Code) | `~/.copilot/skills/cloudhop/` · `.github/skills/cloudhop/` | `code --add-mcp` · `.vscode/mcp.json` |
| Cursor | `~/.cursor/skills/cloudhop/` · `.cursor/skills/cloudhop/` | `~/.cursor/mcp.json` · `.cursor/mcp.json` |
| Codex | `~/.agents/skills/cloudhop/` · `.agents/skills/cloudhop/` | `~/.codex/config.toml` · `.codex/config.toml` |

cloudhop only adds its own entry: other skills and MCP servers in those files
stay as they are. If a settings file has comments (so it isn't plain JSON),
cloudhop leaves it alone and tells you what to add by hand.

**For you or for this project?** Install it *for you* to have it everywhere.
Install it *for this project* to commit it with the repository: everyone on
your team who opens the project gets the same instructions.

## The MCP tools

| Tool | What it does | Changes anything? |
| --- | --- | --- |
| `list_aliases` | Sources and aliases with their session state | No |
| `alias_status` | Which account an alias points to, and whether it can run now | No |
| `whoami` | Asks the cloud who the alias really is | No |
| `open_console` | Opens the AWS console in your browser as the alias, already signed in | No |
| `login` | Opens your browser to sign in and waits up to 5 minutes | Signs you in |
| `run_cloud_cli` | Runs the cloud CLI as the alias (like `hop`) and returns its output | **Can**, so your assistant asks you first |

The MCP tools never open your browser on their own: if a session expired,
they say so and the assistant asks you before calling `login`. They refuse
`--profile`, and they never return credentials.

## Staying up to date

The skill ships inside the cloudhop package, so it goes through the same
review, tests and signed release as the code. You never download
instructions from the internet at run time.

- **After you upgrade cloudhop**, the next `cloudhop` command refreshes every
  skill it installed, and tells you in one line. If you edited a copy,
  cloudhop keeps your version; `cloudhop agent update --force` replaces it.
- **Once a day**, cloudhop checks npm for a newer version and tells you
  (`npm i -g cloudhop`). It only reads the version number. Turn it off with
  `CLOUDHOP_NO_UPDATE_CHECK=1`; it is also off in CI and without a terminal.

## Commands

```bash
cloudhop agent                           # what is installed, for you and this project
cloudhop agent install                   # asks which assistants and where
cloudhop agent install --tools claude,kiro --scope project --no-mcp
cloudhop agent update [--force]          # refresh skills now
cloudhop agent remove [--tools codex] [--scope project]
```

Restart the assistant or start a new chat after installing so it loads the
skill.

## Manual setup

Prefer to do it yourself? Register the MCP server with `cloudhop` as the
command and `mcp` as the argument, for example:

```json
{ "mcpServers": { "cloudhop": { "command": "cloudhop", "args": ["mcp"] } } }
```

The skill text is what `cloudhop agent install` writes; copy it from any
installed `SKILL.md`.

:::note
If your editor can't find the `cloudhop` command when it starts the MCP server
(common when it was opened from the Dock and Node lives in a version manager),
use the full path that `which cloudhop` prints as the command.
:::
