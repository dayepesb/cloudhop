---
title: How it works
description: Sources, targets, aliases and sessions, and what happens when you run hop.
---

cloudhop is a thin layer in front of the AWS CLI. It never replaces it: it
picks the right profile and region, makes sure you are signed in, and gets
out of the way.

## Four ideas

| Idea | What it is | Example |
| --- | --- | --- |
| **Source** | Somewhere you sign in once | The SSO portal `https://acme.awsapps.com/start`, or your personal account |
| **Target** | An account and role you can use from a source | `123456789012` / `AdministratorAccess` |
| **Alias** | Your short name for a target plus a region | `acme-prod` → acme / 123456789012 / AdministratorAccess / us-east-1 |
| **Session** | The sign-in of a source, shared by all its aliases | Valid, renewable, or expired |

One source has many targets; you choose which ones become aliases. All the
aliases of a source share one session, so signing in once covers all of them.

## What happens when you run `hop acme-prod s3 ls`

```text
hop acme-prod s3 ls
 │
 ├─ 1. Find the alias      acme-prod → source "acme", account 123456789012,
 │                         role AdministratorAccess, region us-east-1
 ├─ 2. Check the session   valid → go on
 │                         expired but renewable → renew it silently
 │                         expired → open the browser, sign in, refresh
 │                                   the accounts of "acme"
 └─ 3. Run the AWS CLI     aws s3 ls
                           with AWS_PROFILE=acme-prod, AWS_REGION=us-east-1
```

If the AWS CLI still reports an expired session (for example, it was revoked
on the server), cloudhop signs you in again and retries the command once.

## Two kinds of sources

### Company portals (IAM Identity Center)

You sign in through your company's portal in the browser. cloudhop uses the
same sign-in flow as `aws sso login` and asks the portal which accounts and
roles you have. When the session expires, it renews it with the refresh token
if possible, so you rarely see the browser. See [Company SSO portals](/cloudhop/guides/aws-sso/).

### Personal accounts (`aws login`)

For your own AWS account cloudhop uses `aws login`, which signs you in with
your console user and gives the CLI temporary credentials. No access keys and
no Identity Center needed. See [Personal accounts](/cloudhop/guides/personal-accounts/).

## Where things live

cloudhop keeps its own settings separate and writes standard AWS files, so
everything keeps working with the tools you already use:

- `~/.config/cloudhop/config.yaml`: your sources and aliases. No secrets.
- `~/.aws/config`: one profile per company-portal alias, inside a block
  cloudhop manages.
- `~/.aws/sso/cache/`: the SSO session, in the same format the AWS CLI uses.

Details in [Configuration and files](/cloudhop/reference/files/).

## More clouds

cloudhop is built so other clouds plug in as providers. AWS works today;
Azure and Google Cloud are planned, in the same package, enabled with
`cloudhop provider enable`.
