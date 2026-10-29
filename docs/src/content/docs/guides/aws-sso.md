---
title: Company SSO portals
description: Use one or many AWS IAM Identity Center portals with cloudhop.
---

Most companies give access to AWS through an **IAM Identity Center** portal
(formerly AWS SSO). It has a start URL like `https://acme.awsapps.com/start`:
the page you open to see your accounts.

## Add a portal

```bash
cloudhop add
```

1. Choose **IAM Identity Center (SSO portal)**.
2. Paste the **start URL**. Copy it from the browser when you are on your
   portal's account list, or ask your administrators.
3. Enter the **SSO region**: the region where your company set up Identity
   Center. `us-east-1` is the most common; your administrators know it.
4. Give the portal a **short name** (cloudhop suggests one from the URL, such
   as `acme`). You will see it in `cloudhop ls` and use it in commands like
   `cloudhop login acme`.

The browser opens, you sign in and approve, and cloudhop lists every account
and role you can use. Pick the ones you want and give each an alias and a
region (see [Aliases and regions](/cloudhop/guides/aliases-and-regions/)).

:::tip[Typo in the URL?]
If the sign-in fails, nothing is saved: fix the URL and try again. cloudhop
tells you when AWS doesn't recognise a start URL.
:::

## Several portals

Add as many as you need: run `cloudhop add` again for each one. Each portal has
its own session, so signing in to one doesn't affect the others.

```bash
cloudhop ls
```

```text
acme  AWS · https://acme.awsapps.com/start
  ● session valid
  ALIAS        REGION     ACCOUNT / ROLE
  acme-prod    us-east-1  acme-production / AdministratorAccess
  acme-dev     us-east-2  acme-development / Developer

globex  AWS · https://globex.awsapps.com/start
  ○ expired, opens the browser on next use
  ALIAS        REGION     ACCOUNT / ROLE
  globex-qa    eu-west-1  globex-qa / ReadOnly
```

## Sessions and renewal

How long a session lasts is set by your company in Identity Center (often 8
to 12 hours). cloudhop handles it like this:

- **Valid**: commands run straight away.
- **Renewable**: the session expired but can be renewed without the browser;
  cloudhop does it silently on the next command.
- **Expired**: the next command opens the browser. After you sign in,
  cloudhop refreshes the accounts and roles of that portal and runs your
  command.

To sign in on purpose, for example before going offline:

```bash
cloudhop login acme
```

## Keep the account list up to date

When you get access to a new account, it shows up after the next sign-in. To
refresh now:

```bash
cloudhop sync            # every portal
cloudhop sync acme       # one portal
```

If an account or role you had an alias for disappears, `cloudhop sync` tells
you and `cloudhop ls` marks the alias as no longer available.

## No browser on this machine?

On a remote server (over SSH) the browser can't reach cloudhop. Use the
device code flow: cloudhop prints a URL and a code you confirm from any
device.

```bash
cloudhop login acme --device-code
```

Set `CLOUDHOP_DEVICE_CODE=1` to always use it on that machine.

## What cloudhop writes

A block in `~/.aws/config`, and nothing outside it:

```ini
# >>> cloudhop managed >>> (edit with `cloudhop`, not by hand)
[sso-session cloudhop-acme]
sso_start_url = https://acme.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile acme-prod]
sso_session = cloudhop-acme
sso_account_id = 123456789012
sso_role_name = AdministratorAccess
region = us-east-1
# <<< cloudhop managed <<<
```

The session token goes where the AWS CLI expects it (`~/.aws/sso/cache`), so
`aws --profile acme-prod ...` works too, and so do
[other tools](/cloudhop/guides/other-tools/).

## Remove a portal

```bash
cloudhop rm acme
```

cloudhop asks before removing a portal, because its aliases go with it.
