---
title: Use with other tools
description: Terraform, the AWS SDKs, IDEs and any other tool, through profiles or cloudhop exec.
---

Your aliases work far beyond `hop`. There are two ways to use them elsewhere.

## Option 1: AWS profiles

Every alias of a company portal is a profile in `~/.aws/config` with the same
name, so anything that understands AWS profiles can use it:

```bash
aws s3 ls --profile acme-prod
AWS_PROFILE=acme-prod terraform plan
AWS_PROFILE=acme-prod npm run deploy        # an app using the AWS SDK
```

In Terraform:

```hcl
provider "aws" {
  profile = "acme-prod"
}
```

In the AWS Toolkit for VS Code or JetBrains, pick the profile from the list.

For a [personal account](/cloudhop/guides/personal-accounts/) the profile is
`cloudhop-<source name>` (for example `cloudhop-personal`), the one `aws login`
signs in to.

The tool reads the session cloudhop saved. If it has expired, run any `hop`
command or `cloudhop login acme` to renew it, then try again.

## Option 2: `cloudhop exec`

`cloudhop exec` runs any command with the alias' temporary credentials in the
environment, and renews the session first if needed:

```bash
cloudhop exec acme-prod -- terraform apply
cloudhop exec acme-prod -- python deploy.py
cloudhop exec acme-prod --region eu-west-1 -- cdk deploy
```

The command receives `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`, `AWS_REGION` and `AWS_DEFAULT_REGION`. Use this for
tools that don't read profiles, or when you want a sign-in guaranteed before
a long run.

:::note
The credentials only live in that command's environment. cloudhop never
writes them to disk.
:::

## Which one should I use?

| Situation | Use |
| --- | --- |
| Interactive work with the AWS CLI | `hop acme-prod ...` |
| Tools that support profiles (Terraform, SDKs, IDEs) | `AWS_PROFILE=acme-prod` or the tool's profile setting |
| Tools that only read environment variables | `cloudhop exec acme-prod -- ...` |
| A long job that must not fail on an expired session | `cloudhop exec acme-prod -- ...` |
