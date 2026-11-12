---
title: Use a local emulator
description: Give AWS Emulator or LocalStack an alias, then switch to it and type plain aws, run your tests against it, or keep a project on it with .cloudhoprc. It never reaches AWS.
---

Emulators such as [AWS Emulator](https://github.com/aws/aws-emulator) and
[LocalStack](https://www.localstack.cloud/) serve AWS service APIs on your
machine. cloudhop gives an emulator an alias like any account, so you work
with it the same way:

```text
❯ cloudhop use local
[ aws local (us-east-1) ]
❯ aws s3 mb s3://test            ← goes to the emulator, never to AWS
❯ aws dynamodb list-tables
❯ cloudhop use acme-dev          ← and back to a real account
```

`local` is an example name; you choose it when you add the emulator.

## Add the emulator

Start the emulator as its documentation says, then:

```bash
cloudhop add
```

Choose **AWS Emulator (local)** or **LocalStack or another local emulator**,
accept the defaults (or change the port or endpoint), and name the alias.
There is nothing to sign in to. In one line:

```bash
cloudhop add aws aws-emulator --name local                 # https://127.0.0.1:9297
cloudhop add aws localstack --name localstack              # http://localhost:4566
cloudhop add aws localstack --endpoint http://localhost:4567 --name other
```

You can also add it from [`cloudhop ui`](/cloudhop/guides/web-ui/). Running
one emulator per port, for example one per region? Add each one with its
own port and alias.

## Work with it

Everything you do with an account works with the emulator:

```bash
hop local s3 ls                        # one command
cloudhop use local                     # this terminal, then plain aws
cloudhop exec local -- npm test        # your tests, with any SDK
cloudhop use local --save              # this project always uses the emulator
hop local                              # who am I? account 000000000000
```

Your prompt shows `aws local` like any alias. A `.cloudhoprc` with
`aws: local` is handy for a project whose tests run against the emulator.

## What cloudhop sets up

The alias is a profile in `~/.aws/config`, so the AWS CLI, SDKs and
Terraform find it too:

```ini
[profile local]
region = us-east-1
endpoint_url = https://127.0.0.1:9297
ca_bundle = /Users/you/.aws/emulator/9297/ca.pem
credential_process = cloudhop credentials local
```

- **Endpoint.** Every request goes to the emulator.
- **Keys.** AWS Emulator creates new keys every time it starts.
  `credential_process` makes the AWS CLI ask cloudhop for the current ones
  on each command, so a restart needs nothing from you and the keys are
  never written to your config. LocalStack takes the fake keys `test` /
  `test`, written in the profile.
- **Certificate.** AWS Emulator serves HTTPS with a certificate that
  changes on every start, in the same file. The profile points at that
  file, and `cloudhop exec` also passes it to Node.js
  (`NODE_EXTRA_CA_CERTS`, when you haven't set your own). TLS is never
  turned off.

## When the emulator isn't running

cloudhop checks before each command and tells you how to start it:

```text
❯ hop local s3 ls
✖ The emulator of local isn't running.
  Start AWS Emulator on port 9297 (`aws-emulator -p 9297` on Linux, its
  Docker container on macOS and Windows), then try again.
```

`cloudhop ls` shows **emulator running** or **emulator not running** for
each one. cloudhop never starts or stops the emulator for you.

## Kept apart from AWS

- An emulator alias **never reaches AWS**: its endpoint is your machine,
  and an endpoint on `amazonaws.com` is refused when you add it.
- When you switch to it, cloudhop clears any AWS keys left in the terminal,
  and `cloudhop exec` turns off the fallback to a cloud machine's
  credentials.
- It **can't be marked production** and **has no web console**:
  `cloudhop console local` says so.
- Every emulator answers as account `000000000000`. If `hop local` shows
  another account, something else set an endpoint: check `AWS_ENDPOINT_URL`
  in your terminal.

An operation that answers `NotImplemented` isn't covered by the emulator
yet; that is up to the emulator, not cloudhop.
