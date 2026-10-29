---
title: Personal accounts
description: Use your own AWS account without access keys or IAM Identity Center.
---

For personal accounts cloudhop uses `aws login`, which signs in with the same
user you use in the AWS console and gives the CLI temporary credentials.

- No access keys to create or copy.
- No IAM Identity Center to enable.
- Credentials renew automatically for up to 12 hours; after that the browser
  opens again the next time you use the alias.

## Requirements

- AWS CLI **2.32.0 or newer** (`cloudhop doctor` checks it).
- Root user: nothing else.
- IAM user: the `SignInLocalDevelopmentAccess` managed policy (or the
  `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` actions).
  Users with `AdministratorAccess` already have them.

## Add it

```bash
cloudhop add
```

Choose **Personal account (aws login)** and a default region. The browser
opens so you can sign in to the console; then pick an alias name such as
`personal`.

```bash
hop personal s3 ls
```
