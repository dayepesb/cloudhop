---
name: cloudhop
description: Run AWS CLI commands and other cloud tools as a specific account, role and region through cloudhop aliases (the `hop` and `cloudhop` commands). Use whenever the user asks to do anything in their AWS accounts, inspect or change cloud resources, run aws/terraform/cdk against an account, list their cloud accounts or aliases, or mentions hop or cloudhop.
---

# Working with cloud accounts through cloudhop

The user manages their cloud access with **cloudhop**. Each **alias** (for
example `acme-dev`) points to one account, one role and one region. cloudhop
signs the user in through their browser only when a session has expired. There
are no access keys: never ask for, create, print or store credentials.

## How the user works (to guide them)

When the user asks how to set up or use cloudhop themselves, describe this
path; these are commands for **them** to run in their own terminal:

1. **Once**: `npm install --global cloudhop`, then `cloudhop add` (signs in
   to an SSO portal or personal account and names each account/role as an
   alias), then `cloudhop shell` (adds one line to their shell's startup
   file and, with Starship, the alias segment to `starship.toml`; they open
   a new terminal afterwards). `cloudhop setup` does all of it in one
   guided run. Works in zsh, bash (Git Bash too), fish and PowerShell;
   in Windows `cmd.exe`, `cloudhop use` opens a new `cmd` with the alias in
   its prompt.
2. **Every day**: `cloudhop use <alias>` switches that terminal to an
   account; after that they type plain `aws ...`, Terraform
   or SDK commands. `cloudhop use <other>` switches accounts and
   `cloudhop use --off` goes back. Expired sessions sign in by themselves,
   and on production aliases `aws` asks before changes. Their prompt shows
   the alias in use, in red for production, and `cloudhop status` tells
   them which alias their terminal uses. `cloudhop use` is per terminal: a
   new terminal starts with no alias unless they choose a default with
   `cloudhop use <alias> --default` (or the **Default** box in
   `cloudhop ui`); `cloudhop use --no-default` stops it. A production
   default needs `--yes`. A `cloudhop use` typed in a terminal wins over
   the folder's `.cloudhoprc`, which wins over the default.
3. **Per project**: `cloudhop use <alias> --save` writes a `.cloudhoprc` in
   the folder, so `cd` into it switches the terminal; teammates run
   `cloudhop allow` once after cloning (and again after the file changes);
   `cloudhop deny` withdraws it. A file does nothing until it is trusted.
4. **One-offs**: `hop <alias> <aws args>` runs one command in another
   account without switching; `cloudhop each` runs it in many;
   `cloudhop console <alias> [service]` opens the web console signed in.

Why `cloudhop shell` is needed: a program can't change the environment of
the terminal that started it, only the shell can.
Without it, `cloudhop use` opens a new shell instead; `hop` always works.

Switches, for the user: `CLOUDHOP_WRAP=0` keeps `aws` as the plain AWS
CLI, `CLOUDHOP_AUTO_USE=0` ignores `.cloudhoprc` files, `CLOUDHOP_PROMPT=0`
hides the prompt label. `cloudhop shell starship` prints the Starship
segment for people who place it by hand.

When their terminal doesn't do what they expect:

| They say | Suggest |
| --- | --- |
| "Which account am I in?" | `cloudhop status` (first line) |
| `cloudhop use` opened a new shell / says it needs the integration | `cloudhop shell`, then a new terminal |
| No label in the prompt | Run `cloudhop shell` again (it adds what's missing), then a new terminal |
| `cd` into the project doesn't switch | `cloudhop allow` in that folder; check the alias name exists (`cloudhop ls`) |
| `aws` runs in the wrong account | `cloudhop status`, then `cloudhop use <alias>` or `cloudhop use --off` |
| A new terminal forgot the `cloudhop use` | It's per terminal by design: `cloudhop use <alias> --default` makes every new terminal start with it |

That is the user's way. **You** work differently, below: you always name the
alias with `hop <alias>`, because your shell doesn't have their integration.

## 1. Pick the alias with the user, every time

Before the first cloud operation in a conversation:

1. List the aliases. Use the `list_aliases` tool if the cloudhop MCP server is
   connected; otherwise run `cloudhop ls --json`.
2. Show the user the options (alias, account / role, region) and **ask which
   one to use**. Don't guess, even if one name looks right, and don't pick
   one just because there is only one: confirm it.
   - The listing may carry hints: `folder.aliases` is what this project pins
     in its `.cloudhoprc` (`folder.trusted` says whether the user approved
     it), and `inUse` is what the user switched their terminal to with
     `cloudhop use` (`cloudhop status --json` has `inUse` too); an alias
     with `default: true` is the one their new terminals start with. Offer that
     alias first ("This project uses
     `license-qa`, use it?"), but still wait for the answer.
3. Use that alias for the rest of the conversation. Ask again if the user
   moves to another environment, account or task.

## 2. Check the session before running anything

Run `cloudhop status <alias> --json` (or the `alias_status` tool) and read
`next`:

| `next`            | Meaning                                      | What to do                                                                                                                                        |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`           | Session valid                                | Go ahead                                                                                                                                          |
| `silent-renewal`  | Expired but renewable without the user       | Go ahead; cloudhop renews it                                                                                                                      |
| `browser-sign-in` | The user must sign in                        | Tell the user their browser will open and they need to approve, then run `cloudhop login <source>` (or the `login` tool) and wait up to 5 minutes |
| `unknown`         | Managed by the cloud CLI (personal accounts) | Go ahead; if it fails, run `cloudhop login <source>`                                                                                              |

Don't start several cloud commands in parallel while a sign-in is pending.

## 3. Run commands through the alias

- **AWS CLI**: `hop <alias> <aws arguments>`, e.g. `hop acme-dev s3 ls`.
  It is exactly `aws <arguments>` with the alias' account, role and region.
  Never add `--profile`. Use `--region <r>` only to override the region once.
  With the MCP server, use `run_cloud_cli` with `args` (no program name).
- **Who am I**: `hop <alias>` with no arguments (or the `whoami` tool).
- **The same command in several aliases** (after the user chose them):
  `cloudhop each a,b,c --yes -- <aws arguments>`; add `--json` to parse the
  results.
- **The AWS web console**: `cloudhop console <alias> [service]` (or the
  `open_console` tool) opens it in the user's browser, already signed in.
  Never try to print or fetch its URL.
- **Always name the alias**, even when the project has a `.cloudhoprc` or
  the user's terminal uses an alias: your shell doesn't have the user's
  cloudhop integration, so a plain `aws` may run as anything. Use
  `hop <alias> ...`, never bare `aws`.
- Never run the interactive forms meant for a person at a terminal: `hop` or
  `hop -` without an alias, `cloudhop console` without an alias,
  `cloudhop use` (it changes or opens an interactive shell), `cloudhop
  allow`/`deny` (trusting a folder is the user's decision), `cloudhop setup`,
  or `cloudhop add`/`alias` without flags. Nobody can answer their prompts in
  your terminal.
- **Other tools** (Terraform, CDK, SDK scripts):
  `cloudhop exec <alias> -- <command>`, e.g.
  `cloudhop exec acme-dev -- terraform plan`.
- Prefer `--output json` and `--query` to keep output small.
- Don't export `AWS_PROFILE`, `AWS_ACCESS_KEY_ID` or similar variables, don't
  run commands that print credentials (`env`, `printenv`, `export-credentials`)
  and never edit `~/.aws/config`, `~/.aws/credentials` or cloudhop's own files.

## 4. Confirm before changing anything

- Read-only commands (`list`, `describe`, `get`, `s3 ls`, `logs tail`) can run
  once the user has chosen the alias.
- Before any command that **creates, changes, deletes or costs money**, show
  the alias, account, region and the exact command, and wait for the user's
  explicit "yes". One confirmation covers one command, not a series.
- **Production aliases** have `"prod": true` in `cloudhop ls --json` (and
  `PROD` in `cloudhop ls`). Confirm every change there and suggest a dry run
  (`--dryrun`, `terraform plan`) first. cloudhop enforces it: without a
  terminal, `hop`/`cloudhop exec` refuse changes on production with
  `PROD_CONFIRMATION_REQUIRED`. After the user explicitly approves the exact
  command, rerun it with `CLOUDHOP_CONFIRM_PROD=1` in that command's
  environment (with MCP: `confirm_production: true`). Never set it on your own.
- Treat aliases or accounts that merely look like production (`prd`, `live`)
  the same way, even if they are not marked.
- Don't change cloudhop itself (`cloudhop add`, `rm`, `mv`, `region`, `prod`,
  `team import`, `agent`, `login` for another source) or write a
  `.cloudhoprc` or change their default alias (`use --default`,
  `--no-default`) unless the user asked for it. Never unmark a production
  alias to get around a confirmation.

## 5. When something goes wrong

| You see                                             | Do this                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| "Opening your browser to log in"                    | Tell the user to approve in the browser; the command continues by itself       |
| The command was cut off while waiting for a sign-in | Run `cloudhop login <source>` with a timeout of at least 5 minutes, then retry |
| `LOGIN_REQUIRED`                                    | Same as `browser-sign-in` above                                                |
| No browser on this machine (remote, container)      | Run `cloudhop login <source> --device-code` and show the user the URL and code |
| `Alias "x" not found`                               | Run `cloudhop ls` and ask the user again                                       |
| AWS CLI missing or too old                          | Suggest `cloudhop doctor`; don't install anything without asking               |
| `AccessDenied`                                      | The role lacks permission: tell the user; don't try other aliases on your own  |

More: https://dayepesb.github.io/cloudhop/guides/hop-like-aws/
