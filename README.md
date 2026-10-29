<p align="center">
  <img src="https://raw.githubusercontent.com/dayepesb/cloudhop/main/assets/logo.svg" width="88" height="88" alt="cloudhop logo">
</p>

<h1 align="center">cloudhop</h1>

<p align="center">
  <strong>Every cloud account, one short alias away.</strong><br>
  Sign in once per portal, give each account and role a short alias, and let
  cloudhop log you in again only when a session has expired. No access keys.
</p>

<p align="center">

[![npm](https://img.shields.io/npm/v/cloudhop?color=1767c2)](https://www.npmjs.com/package/cloudhop)
[![Pipeline](https://github.com/dayepesb/cloudhop/actions/workflows/pipeline.yml/badge.svg)](https://github.com/dayepesb/cloudhop/actions/workflows/pipeline.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-1767c2)](https://github.com/dayepesb/cloudhop/blob/main/LICENSE)
[![Docs](https://img.shields.io/badge/docs-dayepesb.github.io%2Fcloudhop-ff7a59)](https://dayepesb.github.io/cloudhop/)

</p>

```bash
npm install --global cloudhop
cloudhop setup               # add your SSO portal, sign in, pick accounts
hop acme-prod s3 ls          # runs `aws s3 ls` as that account, role and region
```

## Why cloudhop

Working with several AWS SSO portals and personal accounts usually means
copying access keys, editing `~/.aws/config` by hand and running
`aws sso login` again and again. cloudhop does that part for you:

- **One sign-in per portal.** Add an IAM Identity Center portal once; cloudhop
  finds every account and role you can use and turns the ones you pick into
  aliases.
- **Logs in only when needed.** Nothing runs in the background. When you use
  an alias with an expired session, cloudhop renews it silently or opens the
  browser, refreshes that portal's accounts, then runs your command.
- **No access keys, ever.** Only temporary credentials: IAM Identity Center
  for companies, `aws login` for personal accounts.
- **Works with your tools.** Aliases are real profiles in `~/.aws/config`, so
  Terraform, the AWS SDKs and your IDE see them too. `cloudhop exec` covers
  everything else.
- **Terminal or browser.** `cloudhop ui` opens a local page to add portals,
  pick accounts and change regions.

## Everyday use

| You want to | Run |
| --- | --- |
| Run any `aws` command as an alias | `hop acme-prod ec2 describe-instances` |
| Check who you are | `hop acme-prod` |
| Use another region once | `hop acme-prod s3 ls --region eu-west-1` |
| Give any tool temporary credentials | `cloudhop exec acme-prod -- terraform plan` |
| See your portals and aliases | `cloudhop ls` |
| Add another portal or personal account | `cloudhop add` |
| Create more aliases from a portal | `cloudhop alias acme` |
| Change an alias' region | `cloudhop region acme-prod us-east-2` |
| Remove an alias or a portal | `cloudhop rm acme-dev` |
| Do all of it from the browser | `cloudhop ui` |

Every setup command also works with flags, for scripts and dotfiles. See the
[command reference](https://dayepesb.github.io/cloudhop/reference/commands/).

## The local web UI

`cloudhop ui` serves a page on your own computer (and only there) to manage
portals, aliases and regions.

<p align="center">
  <img src="https://raw.githubusercontent.com/dayepesb/cloudhop/main/assets/ui-screenshot.png" alt="cloudhop ui listing two portals with their aliases, regions and session state" width="840">
</p>

## Requirements

- Node.js 20 or newer.
- AWS CLI v2 to run commands through aliases (`cloudhop setup` offers to
  install it). Personal accounts need AWS CLI 2.32.0 or newer.
- macOS, Linux or Windows.

## Security

- No long-lived secrets: sessions live in the AWS CLI's own token cache, and
  `~/.aws/credentials` is never written.
- cloudhop only edits its own block in `~/.aws/config` and never overwrites
  profiles you wrote by hand.
- The web UI listens on `127.0.0.1` only and needs a one-time key per run.
- Releases are published by GitHub Actions after a maintainer's approval,
  with npm provenance. Verify with `npm audit signatures`.

Found a vulnerability? Please
[report it privately](https://github.com/dayepesb/cloudhop/security/advisories/new).

## Documentation

**[dayepesb.github.io/cloudhop](https://dayepesb.github.io/cloudhop/)**, in
English and [Spanish](https://dayepesb.github.io/cloudhop/es/):
[getting started](https://dayepesb.github.io/cloudhop/getting-started/),
[company SSO portals](https://dayepesb.github.io/cloudhop/guides/aws-sso/),
[personal accounts](https://dayepesb.github.io/cloudhop/guides/personal-accounts/),
[other tools](https://dayepesb.github.io/cloudhop/guides/other-tools/) and
[troubleshooting](https://dayepesb.github.io/cloudhop/reference/troubleshooting/).

## Roadmap

AWS is fully supported. **Azure** and **Google Cloud** are next, as providers
in the same package. The work is broken down into
[issues on the roadmap](https://github.com/dayepesb/cloudhop/issues?q=is%3Aopen+label%3Aroadmap);
pick one up!

## Contributing

Contributions are welcome. Start with
[CONTRIBUTING.md](https://github.com/dayepesb/cloudhop/blob/main/CONTRIBUTING.md)
and [ARCHITECTURE.md](https://github.com/dayepesb/cloudhop/blob/main/ARCHITECTURE.md),
and follow the
[Code of Conduct](https://github.com/dayepesb/cloudhop/blob/main/CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](https://github.com/dayepesb/cloudhop/blob/main/LICENSE).
See [NOTICE](https://github.com/dayepesb/cloudhop/blob/main/NOTICE).
