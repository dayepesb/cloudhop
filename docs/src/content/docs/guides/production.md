---
title: Protect production
description: Mark aliases as production so cloudhop, and your AI assistant, ask before changing anything there.
---

Mark the aliases that point to production:

```bash
cloudhop prod acme-prod billing-prod   # mark
cloudhop prod                          # list the production aliases
cloudhop prod acme-prod --off          # unmark
```

When you create aliases, cloudhop asks "Is it production?" and already
suggests *yes* for names like `prod`, `prd`, `production` or `live`. The web
UI has a **Prod** checkbox on every alias. Production aliases show a red
**PROD** tag in `cloudhop ls`, `cloudhop status`, the web UI and the alias
picker.

## What changes for a production alias

- **Reading is free.** `hop acme-prod s3 ls`, `describe-*`, `list-*`, `get-*`,
  `logs tail`, downloads (`s3 cp s3://… ./`) and anything with `--dryrun` run
  straight away, with a red reminder that you are in production.
- **Changing asks first.** Anything else, and anything cloudhop isn't sure
  about, shows the alias, account, region and the exact command, and asks
  *Run it in acme-prod?* with **No** as the default.

  ```text
  ▲  PRODUCTION  acme-prod → acme-production / AdministratorAccess, us-east-1
     This may change resources: aws s3 rm s3://reports/2024.csv
  ◆  Run it in acme-prod?
  │  ○ Yes / ● No
  ```

- **`cloudhop exec`** always asks for production aliases, because cloudhop
  can't know what another tool (Terraform, a script) will do.
- **`cloudhop each`** asks once more for the production aliases in the
  selection when the command may change something.

## Scripts and AI assistants

Without a terminal there is nobody to ask, so changes on production are
refused with `PROD_CONFIRMATION_REQUIRED`. Once a person has approved that
exact command, set `CLOUDHOP_CONFIRM_PROD=1` for it:

```bash
CLOUDHOP_CONFIRM_PROD=1 hop acme-prod s3 rm s3://reports/2024.csv
```

The [AI assistant skill](/cloudhop/guides/ai-assistants/) teaches your
assistant exactly this: show you the command, wait for your *yes*, and only
then rerun it with that variable (or, through MCP, with
`confirm_production: true`). It must never set it on its own.

:::caution[What this protects]
The protection covers commands that go through cloudhop: `hop`,
`cloudhop exec`, `cloudhop each` and the MCP server. A plain `aws` command in
a shell where you ran `cloudhop use acme-prod`, or Terraform pointed at the
profile directly, isn't intercepted; cloudhop reminds you of this when you
`use` a production alias. It is a seatbelt against mistakes, not a
replacement for IAM permissions.
:::
