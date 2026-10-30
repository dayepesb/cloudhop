---
title: Use hop like the aws command
description: hop is the AWS CLI with the account, role and region already chosen. Everything you know about aws still works.
---

`hop` doesn't replace the AWS CLI: it runs it for you. `hop acme-prod <args>`
runs `aws <args>` with the alias' profile and region set, after making sure
you are signed in. Anything you can do with `aws`, you can do with `hop`.

:::tip[Rather keep typing `aws`?]
Switch the terminal instead: `cloudhop use acme-prod`, then plain `aws ...`.
See [Use an alias in your terminal](/cloudhop/guides/shell/). `hop` is
handy for one-off commands in another account without switching.
:::

## The rule

Take any `aws` command, replace `aws` with `hop <alias>`, and remove
`--profile` (the alias already says which account and role):

```bash
aws  s3 cp report.csv s3://acme-reports/ --profile acme-prod
hop acme-prod s3 cp report.csv s3://acme-reports/
```

With no arguments, `hop <alias>` runs `aws sts get-caller-identity`, a quick
"who am I?":

```bash
hop acme-prod
```

```json
{
    "UserId": "AROAEXAMPLEID:you@acme.com",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_AdministratorAccess_abc123/you@acme.com"
}
```

## Everything passes through

| You use | It works because |
| --- | --- |
| Any service and subcommand (`s3`, `ec2`, `eks`, `logs tail --follow`, ...) | The arguments go to `aws` untouched |
| `--region eu-west-1` | It overrides the alias' region for that command only |
| `--output json`, `--query`, `--no-cli-pager` | They are `aws` options, passed as is |
| Pipes and redirects: `hop acme-prod s3 ls \| grep logs` | Standard output is `aws`'s own; cloudhop writes its messages to standard error |
| Interactive commands and prompts | Standard input goes straight to `aws` |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | It stops `aws`, as usual |
| Exit codes in scripts (`if hop acme-prod s3 ls ...`) | `hop` returns the exit code of `aws` |

## What cloudhop adds around the command

1. **Finds the alias**: account, role and region.
2. **Checks the session.** If it expired, cloudhop renews it silently, or
   opens the browser and waits for you to sign in.
3. **Runs `aws`** with `AWS_PROFILE` and `AWS_REGION` set to the alias.
   Access keys inherited from your shell (`AWS_ACCESS_KEY_ID` and friends) are
   ignored so they can't silently override the alias.
4. **Retries once** if `aws` still reports an expired session, after signing
   you in again.

So a command never starts with a session cloudhop already knows is expired.

## In scripts

`hop` works in shell scripts and Makefiles exactly like `aws`:

```bash
#!/usr/bin/env bash
set -euo pipefail

for alias in acme-prod acme-dev; do
  echo "== $alias"
  hop "$alias" s3 ls --output text | wc -l
done
```

If a session expired, the script stops at the first `hop` and opens the
browser; once you sign in, it continues.

## Other tools, not `aws`

For Terraform, the SDKs or any other program, use the alias' profile
(`AWS_PROFILE=acme-prod`) or `cloudhop exec`. See
[Use with other tools](/cloudhop/guides/other-tools/).

```bash
cloudhop exec acme-prod -- terraform plan
```

## Tips

- **Tab completion:** `hop acme-prod s3 <Tab>` doesn't complete AWS
  subcommands. If you rely on completion, `aws --profile acme-prod ...` works
  too, because the alias is a real profile (for company portals).
- **Another region once:** `--region` at the end is enough; to change it for
  good, use `cloudhop region acme-prod <region>`.
- **Several accounts side by side:** each `hop` call is independent, so two
  terminals can use two aliases at the same time.
