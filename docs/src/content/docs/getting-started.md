---
title: Getting started
description: Install cloudhop and add your first account in two minutes.
---

## Install

cloudhop needs Node.js 20 or newer.

```bash
npm i -g cloudhop
```

This installs two commands: `cloudhop` and its short form `hop`.

## Set up

```bash
cloudhop setup
```

The wizard:

1. Asks which clouds you use (AWS today; Azure and Google Cloud are coming).
2. Checks that the AWS CLI v2 is installed and offers to install it if not.
3. Adds your first source: a company SSO portal or a personal account.
4. Opens the browser so you can log in.
5. Lists every account and role you have access to so you can pick the ones
   you want and give each one a short alias.

## Use an alias

```bash
hop acme-prod                      # who am I? (aws sts get-caller-identity)
hop acme-prod s3 ls                # any aws command, as acme-prod
hop acme-prod s3 ls --region eu-west-1
```

Need credentials for another tool?

```bash
cloudhop exec acme-prod -- terraform plan
```

## When a session expires

You don't have to do anything. The next time you use an alias, cloudhop
renews the session silently if it can. If it can't, it opens the browser,
refreshes every account in that portal and then runs your command.
