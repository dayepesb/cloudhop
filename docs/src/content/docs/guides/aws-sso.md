---
title: Company SSO portals
description: Use AWS IAM Identity Center portals (awsapps.com) with cloudhop.
---

Most companies give access to AWS through an IAM Identity Center portal with a
start URL like `https://my-company.awsapps.com/start`.

## Add a portal

```bash
cloudhop add
```

Choose **IAM Identity Center (SSO portal)**, paste the start URL and the SSO
region (ask your admins; `us-east-1` is common). cloudhop opens the browser,
you approve, and it lists every account and role available to you.

Add as many portals as you need: each one gets its own name (for example
`acme`, `globex`, `initech`).

## Keep accounts up to date

```bash
cloudhop sync            # every portal
cloudhop sync acme       # one portal
```

Logging in again (automatically or with `cloudhop login acme`) also syncs, so
new accounts show up without extra steps.

## What cloudhop writes

cloudhop adds a block to `~/.aws/config` and never touches anything outside
it:

```ini
# >>> cloudhop managed >>> (edit with `cloudhop`, not by hand)
[sso-session cloudhop-acme]
sso_start_url = https://acme.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile acme-prod]
sso_session = cloudhop-acme
sso_account_id = 123456789012
sso_role_name = AdminAccess
region = us-east-1
# <<< cloudhop managed <<<
```

The SSO token is stored where the AWS CLI expects it
(`~/.aws/sso/cache`), so `aws --profile acme-prod ...` and `AWS_PROFILE=acme-prod`
work too.

## No browser on this machine?

Use the device code flow, for example over SSH:

```bash
cloudhop login acme --device-code
```
