---
title: Commands
description: Every cloudhop command.
---

| Command | What it does |
| --- | --- |
| `hop <alias> [args...]` | Runs the cloud CLI as the alias. Without args, shows who you are. |
| `cloudhop exec <alias> [--region <r>] -- <cmd...>` | Runs any tool with the alias' temporary credentials in its environment. |
| `cloudhop setup` | Chooses your clouds, checks their CLIs and adds your first source. |
| `cloudhop add` | Adds an SSO portal or a personal account. |
| `cloudhop alias [source]` | Creates more aliases from a source. |
| `cloudhop login [source]` | Logs in again and refreshes the source's accounts. |
| `cloudhop sync [source]` | Refreshes the accounts/roles you have access to. |
| `cloudhop ls [source]` | Lists each source with its session state and its aliases. Pass a source to see only that one. |
| `cloudhop region <alias> [region]` | Changes the region an alias runs in (asks when you leave it out). |
| `cloudhop ui [--port <n>] [--no-open]` | Opens a local web page to add sources, pick aliases, change regions and remove things. |
| `cloudhop rm <alias...>` | Removes aliases. `--source <id>` removes a source and its aliases. |
| `cloudhop provider [ls\|enable\|disable] <id>` | Manages which clouds are enabled. |
| `cloudhop doctor` | Checks the cloud CLIs and offers to install missing ones. |

## Options

| Option | Meaning |
| --- | --- |
| `--device-code` | Log in with a code instead of the local browser redirect. |
| `-v`, `--version` | Show the version. |

## Environment variables

| Variable | Meaning |
| --- | --- |
| `CLOUDHOP_HOME` | Config directory (default `~/.config/cloudhop`). |
| `CLOUDHOP_AWS_DIR` | AWS directory (default `~/.aws`). |
| `CLOUDHOP_DEBUG` | Print stack traces on errors. |
