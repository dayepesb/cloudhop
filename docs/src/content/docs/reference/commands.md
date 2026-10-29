---
title: Commands
description: Every cloudhop command and option.
---

`cloudhop` and `hop` are the same program. Use `hop` for daily work and
`cloudhop` for setup; both accept every command.

## Run as an alias

### `hop <alias> [args...]`

Runs the AWS CLI as the alias: `hop acme-prod s3 ls` runs `aws s3 ls` with the
alias' profile and region. With no arguments it runs
`aws sts get-caller-identity`, which shows who you are.

- Signs you in first if the session expired, and retries once if the AWS CLI
  reports an expired session.
- Everything after the alias goes to `aws` untouched, including `--region` and
  `--output`.
- Ignores `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`
  from your shell, which would otherwise win over the profile.
- Returns the exit code of `aws`.

### `cloudhop exec <alias> [--region <r>] -- <command...>`

Runs any command with the alias' temporary credentials in its environment
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
`AWS_REGION`, `AWS_DEFAULT_REGION`). Returns the command's exit code. See
[Use with other tools](/cloudhop/guides/other-tools/).

## Set up

| Command | What it does |
| --- | --- |
| `cloudhop setup` | Guided first run: choose clouds, check the AWS CLI, add a source. Needs a terminal. |
| `cloudhop add` | Add an SSO portal or personal account, sign in and create aliases. |
| `cloudhop add aws sso --start-url <url> [--region <r>] [--name <id>]` | Same, without questions. |
| `cloudhop add aws console-login [--region <r>] [--name <id>]` | Add a personal account without questions. |
| `cloudhop ui [--port <n>] [--no-open]` | The same, from a [local web page](/cloudhop/guides/web-ui/). |

## Aliases

| Command | What it does |
| --- | --- |
| `cloudhop alias [source]` | Pick more accounts and roles from a source and name them. |
| `cloudhop alias <source> --list` | Print the source's accounts and roles with their ids. |
| `cloudhop alias <source> --target <id> [--name <alias>] [--region <r>]` | Create one alias without questions. |
| `cloudhop region <alias> [region]` | Change the region of an alias (asks when you leave it out). |
| `cloudhop rm <name...> [--yes]` | Remove aliases, or sources with their aliases. Removing a source asks first; `--yes` skips it. |
| `cloudhop rm --source <id>` | Remove a source when an alias has the same name. |
| `cloudhop ls [source] [--json]` | List sources with their session state and aliases. `--json` prints the same data for scripts and AI assistants. |
| `cloudhop status [alias] [--json]` | Whether an alias (or every source) can run now, renews silently, or needs a browser sign-in. Never signs in by itself. |

## Sessions

| Command | What it does |
| --- | --- |
| `cloudhop login [source]` | Sign in again now and refresh the source's accounts and roles. |
| `cloudhop sync [source]` | Refresh the accounts and roles of one or every source. |

## AI assistants

| Command | What it does |
| --- | --- |
| `cloudhop agent [status]` | Which assistants have the cloudhop skill and MCP server, for you and for this project. |
| `cloudhop agent install [--tools <list>] [--scope user\|project] [--no-mcp]` | Teach Claude Code, Kiro, Copilot, Cursor or Codex to use cloudhop. See [AI assistants](/cloudhop/guides/ai-assistants/). |
| `cloudhop agent update [--force]` | Refresh installed skills now (`--force` also replaces copies you edited). |
| `cloudhop agent remove [--tools <list>] [--scope user\|project]` | Remove the skill and the MCP server entry. |
| `cloudhop mcp` | The Model Context Protocol server (stdio) that assistants start for you. |

## Clouds and tools

| Command | What it does |
| --- | --- |
| `cloudhop provider ls` | List the clouds cloudhop supports and which are enabled. |
| `cloudhop provider enable <id>` / `disable <id>` | Turn a cloud on or off (`aws` today). |
| `cloudhop doctor` | Check that each enabled cloud's CLI is installed and recent enough, and offer to install it. |

## Global options

| Option | What it does |
| --- | --- |
| `--device-code` | Sign in with a code you confirm on any device, instead of the browser redirect. Useful over SSH. |
| `-v`, `--version` | Print the version. |
| `-h`, `--help` | Print the help. |

## Environment variables

| Variable | What it does |
| --- | --- |
| `CLOUDHOP_HOME` | Where cloudhop keeps its settings. Default `~/.config/cloudhop` (or `$XDG_CONFIG_HOME/cloudhop`). |
| `CLOUDHOP_AWS_DIR` | The AWS folder to use instead of `~/.aws`. Handy for testing. |
| `CLOUDHOP_DEVICE_CODE=1` | Always sign in with a device code. |
| `CLOUDHOP_DEBUG=1` | Print full error details. |
| `CLOUDHOP_NO_UPDATE_CHECK=1` | Don't check npm for a newer version (also off in CI and without a terminal). |
