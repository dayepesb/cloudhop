---
title: Web UI
description: Manage sources and aliases from a local web page instead of the terminal.
---

Prefer clicking to answering prompts? Run:

```bash
cloudhop ui
```

cloudhop starts a small web server on your computer and opens it in the
browser. From there you can:

- Add an SSO portal or a personal account and sign in.
- Pick the accounts and roles you want, with an alias and a region for each.
- Change the region of an alias, or remove it.
- Sign in again or sync a source to pick up new accounts.

Everything you do there is the same as the CLI: aliases created in the page
work with `hop` right away, and the other way around.

## Options

| Option | What it does |
| --- | --- |
| `--port <n>` | Use a fixed port instead of a random free one. |
| `--no-open` | Print the link without opening the browser. |

Press `Ctrl-C` in the terminal to stop it.

## Is it safe?

The page is only reachable from your own computer, and only through the link
the command prints. That link carries a one-time key that changes every
time you run `cloudhop ui`, so other websites cannot use it. The page never
sees your SSO tokens or AWS credentials.
