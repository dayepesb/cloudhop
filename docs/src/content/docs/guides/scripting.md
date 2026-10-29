---
title: Scripts and automation
description: Use cloudhop without prompts, from scripts, dotfiles or setup tools.
---

Every setup command also works with flags, so you can script a new machine or
share a setup with your team. Without a terminal (in a script, a pipe or CI),
cloudhop never waits for an answer: it tells you which flag is missing.

## Set up a machine

```bash
cloudhop provider enable aws

# A company portal: signs in through the browser, then lists accounts
cloudhop add aws sso --start-url https://acme.awsapps.com/start --region us-east-1 --name acme

# See the accounts and roles, with their ids
cloudhop alias acme --list

# Create aliases
cloudhop alias acme --target 123456789012/AdministratorAccess --name acme-prod
cloudhop alias acme --target 210987654321/ReadOnly --name acme-dev --region us-east-2
```

The `--target` id is `<account id>/<role name>`, as shown by `--list`.

For a personal account:

```bash
cloudhop add aws console-login --region us-east-1 --name personal
```

## Other non-interactive commands

```bash
cloudhop region acme-prod eu-west-1
cloudhop rm acme-dev
cloudhop rm acme --yes          # removing a source needs --yes without a terminal
cloudhop ls
```

## In CI

cloudhop is built for people: signing in needs a browser and a human. In CI,
use the cloud's own mechanisms instead, such as GitHub Actions OIDC with
[`aws-actions/configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | cloudhop error (the message says what and how to fix it) |
| `130` | Cancelled with <kbd>Ctrl</kbd>+<kbd>C</kbd> |
| other | `hop` and `cloudhop exec` return the exit code of the command they ran |
