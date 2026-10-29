---
title: Web UI
description: Manage portals, accounts, aliases and regions from a local web page.
---

Prefer clicking to answering prompts? Run:

```bash
cloudhop ui
```

cloudhop starts a small web server on your computer and opens it in your
browser. Everything you do there is the same as in the terminal: aliases
created in the page work with `hop` straight away, and the other way around.

## Pages

| Page | What it's for |
| --- | --- |
| **Aliases** (home) | Every alias in one table, with a filter (any words, in any order), a source filter and *Production only*. Change regions, open the console, mark production, rename or remove. |
| **Sources** | Your SSO portals and personal accounts: session state, sign in, sync, add aliases, remove. *View aliases →* opens the alias table filtered to that source. |
| **AI assistants** | Install, update or remove the cloudhop skill and MCP server, for you or this project. |
| **Tools** | The AWS CLI's status and ready-to-copy commands for the shell integration, running in many accounts and sharing with your team. |

Pages have their own address (`#/aliases`, `#/sources`, `#/assistants`,
`#/tools`), so the browser's back button works.

## What you can do

- **Add a source.** Click **+ Add source**, choose a company portal or a
  personal account and fill in the form. A browser tab opens to sign in. If
  it fails (a typo in the URL, say), the form comes back with what you typed
  and the error, and nothing is saved.
- **Create aliases.** **+ Aliases** lists every account and role of the
  source, with a filter. Tick the ones you want and give each an alias and a
  region. Accounts that already have an alias are marked.
- **Change a region.** Edit it in the table and press <kbd>Enter</kbd>.
- **Open the AWS console** as an alias, already signed in, with **Console**.
- **Mark production** with the **Prod** checkbox, and **rename** with ✎.
- **Sign in again or sync** a source with its buttons.
- **Remove** an alias (✕) or a whole source (**Remove**, asks first).
- **Teach your AI assistants.** The *AI assistants* section installs, updates
  or removes the cloudhop skill and MCP server for each assistant, for you or
  only for the project you started `cloudhop ui` in. See
  [AI assistants](/cloudhop/guides/ai-assistants/).

## Options

| Option | What it does |
| --- | --- |
| `--port <n>` | Use a fixed port instead of a random free one. |
| `--no-open` | Print the link without opening the browser. |

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal to stop it.

:::caution[Don't press Ctrl+Z]
<kbd>Ctrl</kbd>+<kbd>Z</kbd> pauses the server instead of stopping it, and
the page stops answering. The page tells you when that happens; run `fg` in
the terminal to resume, or <kbd>Ctrl</kbd>+<kbd>C</kbd> and start it again.
:::

## Is it safe?

The page is only reachable from your own computer, and only through the link
the command prints. That link carries a one-time key that changes every time
you run `cloudhop ui`, so other websites can't use it. The page never sees
your SSO tokens or AWS credentials. More in [Security](/cloudhop/reference/security/).
