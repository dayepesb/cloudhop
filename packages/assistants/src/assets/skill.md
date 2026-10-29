---
name: cloudhop
description: Run AWS CLI commands and other cloud tools as a specific account, role and region through cloudhop aliases (the `hop` and `cloudhop` commands). Use whenever the user asks to do anything in their AWS accounts, inspect or change cloud resources, run aws/terraform/cdk against an account, list their cloud accounts or aliases, or mentions hop or cloudhop.
---

# Working with cloud accounts through cloudhop

The user manages their cloud access with **cloudhop**. Each **alias** (for
example `acme-dev`) points to one account, one role and one region. cloudhop
signs the user in through their browser only when a session has expired. There
are no access keys: never ask for, create, print or store credentials.

## 1. Pick the alias with the user, every time

Before the first cloud operation in a conversation:

1. List the aliases. Use the `list_aliases` tool if the cloudhop MCP server is
   connected; otherwise run `cloudhop ls --json`.
2. Show the user the options (alias, account / role, region) and **ask which
   one to use**. Don't guess, even if one name looks right, and don't pick
   one just because there is only one: confirm it.
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
- **The AWS web console**: `cloudhop console <alias> [service]` opens it in
  the user's browser, already signed in. Never try to print or fetch its URL.
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
- Don't change cloudhop itself (`cloudhop add`, `rm`, `region`, `login` for
  another source) unless the user asked for it.

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
