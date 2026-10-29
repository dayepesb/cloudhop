---
title: Personal accounts
description: Use your own AWS account without access keys or IAM Identity Center.
---

For an AWS account of your own, cloudhop uses `aws login`: you sign in with
the same user you use in the AWS console and the CLI gets temporary
credentials.

- No access keys to create, copy or rotate.
- No IAM Identity Center to set up.
- Credentials renew automatically for up to 12 hours; after that the browser
  opens again the next time you use the alias.

## Requirements

- **AWS CLI 2.32.0 or newer.** `cloudhop doctor` checks it and offers to
  update it.
- **Root user:** nothing else.
- **IAM user:** the `SignInLocalDevelopmentAccess` managed policy, or the
  `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` actions.
  Users with `AdministratorAccess` already have them.

## Add it

```bash
cloudhop add
```

1. Choose **Personal account (aws login)**.
2. Pick a default region.
3. Give it a short name, such as `personal`.

The browser opens so you can sign in to the console. Then choose the alias
name (cloudhop suggests the source name):

```bash
hop personal                 # who am I?
hop personal s3 ls
```

Add one source per personal account if you have several.

## How it differs from an SSO portal

| | SSO portal | Personal account |
| --- | --- | --- |
| Sign in with | Your company identity | Your console user (root or IAM) |
| Accounts per source | Many, discovered for you | One |
| Renewal | Refresh token, set by your company | Up to 12 hours |
| AWS profile for other tools | One per alias, same name | `cloudhop-<source name>`, shared by its aliases |

:::caution[Moving away from access keys?]
If you used access keys in `~/.aws/credentials` for this account, add it to
cloudhop, check that `hop personal` works, then delete those keys in the IAM
console.
:::
