# Security policy

cloudhop handles cloud sign-in sessions, so security reports get priority.

## Reporting a vulnerability

Please report it privately through GitHub:
**[Report a vulnerability](https://github.com/dayepesb/cloudhop/security/advisories/new)**.
Do not open a public issue.

Include what you found, how to reproduce it and the version
(`cloudhop --version`). You will get an answer within a few days, and credit
in the release notes if you want it.

## Supported versions

Only the latest release on npm gets security fixes.

## What cloudhop does to stay safe

- It never stores access keys. It uses IAM Identity Center and `aws login`
  sessions, kept in the same cache the AWS CLI uses, with `0600` permissions.
- `cloudhop ui` listens on `127.0.0.1` only, needs a per-run token, rejects
  foreign `Host`/`Origin` headers and sends a strict Content-Security-Policy.
- Releases are built and published by GitHub Actions with npm trusted
  publishing and provenance, after a maintainer approves them. Check a
  release with `npm audit signatures`.
