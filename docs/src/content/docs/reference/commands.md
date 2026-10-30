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

### `hop` and `hop - [args...]`

With no alias, `hop` lets you pick it from a list (type to filter), then asks
for the command. `hop - s3 ls` picks the alias and runs `aws s3 ls`.

### `cloudhop console [alias] [service] [--region <r>]`

Opens the AWS console as the alias, already signed in. See
[Open the AWS console](/cloudhop/guides/console/).

### `cloudhop each <selection...> [--source <s>] [--prod|--no-prod] [--parallel <n>] [--yes] [--json] -- <args...>`

Runs one `aws` command in many aliases. See
[Run in many accounts](/cloudhop/guides/many-accounts/).

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
| `cloudhop mv <alias> <new-name>` | Rename an alias (and its AWS profile). |
| `cloudhop prod [alias...] [--off]` | Mark aliases as production, or list them. See [Protect production](/cloudhop/guides/production/). |
| `cloudhop rm <name...> [--yes]` | Remove aliases, or sources with their aliases. Removing a source asks first; `--yes` skips it. |
| `cloudhop rm --source <id>` | Remove a source when an alias has the same name. |
| `cloudhop ls [source] [--json]` | List sources with their session state and aliases. `--json` prints the same data for scripts and AI assistants. |
| `cloudhop status [alias] [--json]` | Which alias this terminal uses, and whether an alias (or every source) can run now, renews silently, or needs a browser sign-in. Never signs in by itself. |

## Sessions

| Command | What it does |
| --- | --- |
| `cloudhop login [source]` | Sign in again now and refresh the source's accounts and roles. |
| `cloudhop sync [source]` | Refresh the accounts and roles of one or every source. |

## Your terminal

| Command | What it does |
| --- | --- |
| `cloudhop use [alias]` | Switch this terminal to an alias: then plain `aws`, Terraform and SDKs run as it. Without the shell integration it opens a new shell instead. See [Use an alias in your terminal](/cloudhop/guides/shell/). |
| `cloudhop use <alias> --save` | Same, and pin it to this folder in a `.cloudhoprc` (trusted for you). |
| `cloudhop use --off [cloud]` | Stop using the alias of every cloud, or of one (`aws`). |
| `cloudhop use <alias> --default` | Same, and every new terminal starts with it. A production alias also needs `--yes`. |
| `cloudhop use --no-default [cloud]` | New terminals start with no alias again (of every cloud, or of one). |
| `cloudhop allow [folder]` / `cloudhop deny [folder]` | Trust (or stop trusting) a folder's `.cloudhoprc`, so `cd` switches to its aliases. |
| `cloudhop shell` | Set up your terminal once: adds one line to your shell's startup file and, if you use Starship, the alias segment to `starship.toml` (same as `cloudhop shell install`). |
| `cloudhop shell zsh\|bash\|fish\|pwsh` | Print the integration script; that line runs it. |
| `cloudhop shell starship` | Print prompt segments for [Starship](https://starship.rs). |

## Team

| Command | What it does |
| --- | --- |
| `cloudhop team export [--sources <list>] [--out <file>]` | Export portals and aliases for your team (no secrets). |
| `cloudhop team import <file\|https URL> [--yes]` | Import a team setup. See [Share with your team](/cloudhop/guides/team/). |

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
| `CLOUDHOP_CONFIRM_PROD=1` | A person approved this change on a production alias; don't ask (for scripts and AI assistants). |
| `CLOUDHOP_NO_UPDATE_CHECK=1` | Don't check npm for a newer version (also off in CI and without a terminal). |
| `CLOUDHOP_WRAP=0` | With the shell integration, keep `aws` as the plain AWS CLI even while an alias is in use. |
| `CLOUDHOP_AUTO_USE=0` | With the shell integration, don't switch aliases from `.cloudhoprc` files on `cd`. |
| `CLOUDHOP_PROMPT=0` | With the shell integration, don't add the alias label to the prompt. |

`cloudhop use` sets `CLOUDHOP_AWS_ALIAS`, `CLOUDHOP_AWS_PROMPT` and
`CLOUDHOP_AWS_PROD` for your prompt; see
[Use an alias in your terminal](/cloudhop/guides/shell/#see-the-alias-in-your-prompt).
