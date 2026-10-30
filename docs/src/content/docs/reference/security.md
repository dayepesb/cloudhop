---
title: Security
description: How cloudhop keeps your cloud access safe, and how to report a problem.
---

cloudhop sits between you and your cloud accounts, so it is designed to hold
as little as possible.

## No long-lived secrets

- **No access keys.** Company portals use IAM Identity Center; personal
  accounts use `aws login`. Both give temporary credentials.
- **Tokens stay where the AWS CLI keeps them** (`~/.aws/sso/cache`), readable
  only by your user. cloudhop's own settings contain no secrets.
- **Credentials for `cloudhop exec`** live only in that command's environment;
  they are never written to disk.
- **Inherited keys are ignored.** `hop` drops `AWS_ACCESS_KEY_ID` and friends
  from your shell, so an old key can't silently win over the alias.

## Sign-in

cloudhop uses the same OAuth flows as the AWS CLI: authorization code with
PKCE and a browser redirect to `127.0.0.1`, or a device code with
`--device-code`. Your password and MFA only ever go to AWS's own pages.

## Your terminal and `.cloudhoprc`

- `cloudhop use` puts only a profile name and a region in your terminal,
  never credentials, and clears access keys it finds there.
- A `.cloudhoprc` is ignored until you approve it with `cloudhop allow`.
  cloudhop stores a fingerprint of the approved content: if the file changes
  (say, after a `git pull`), it asks again. So a repository you clone can't
  switch your terminal to another account without you knowing.
- A `.cloudhoprc` can only name aliases you already have. It can't add
  portals, sign you in or run anything, and its values are validated as
  alias names before they reach your shell.
- Entering a folder never opens your browser: the first command that needs a
  session does.

## The local web UI

`cloudhop ui` exposes the same actions as the CLI, so it is locked to the
person at the keyboard:

- It listens on `127.0.0.1` only.
- Every request needs a random key created for that run. It travels in the
  link's `#fragment`, so it is never sent in a request line or `Referer`.
- Requests whose `Host` or `Origin` isn't the local address are rejected,
  which blocks other websites and DNS-rebinding tricks.
- A strict Content-Security-Policy allows only the page's own script.
- The page receives what `cloudhop ls` shows, never tokens or credentials.

## AI assistants

- **The skill is text you can read**, installed only where you choose, and it
  ships inside the cloudhop package. Nothing downloads instructions at run
  time, so changing what your assistant is told requires a reviewed, signed
  release.
- **The MCP server** (`cloudhop mcp`) runs on your computer, talks only to the
  assistant that started it, and never returns tokens or credentials.
- Its tools **never open your browser on their own**: an expired session is
  reported, and the assistant has to ask you before calling `login`.
- `run_cloud_cli` is marked as able to change resources, so assistants ask
  for your permission; it refuses `--profile`.
- cloudhop only edits its own entry in each assistant's settings and refuses
  to rewrite files it can't parse.
- The daily update check reads only the latest version number from npm. Turn
  it off with `CLOUDHOP_NO_UPDATE_CHECK=1`.

## How releases are made

- Every change is checked by CodeQL, a dependency audit and a secret scan,
  plus tests on Linux, macOS and Windows.
- Releases are built and published by GitHub Actions, only after a maintainer
  approves them, using npm trusted publishing: no npm token exists to steal.
- Every release carries npm provenance. Verify what you installed with:

  ```bash
  npm audit signatures
  ```

## Report a vulnerability

Please report it privately on GitHub:
[Report a vulnerability](https://github.com/dayepesb/cloudhop/security/advisories/new).
Don't open a public issue. See the
[security policy](https://github.com/dayepesb/cloudhop/blob/main/SECURITY.md).
