<p align="center">
  <img src="https://raw.githubusercontent.com/dayepesb/cloudhop/main/assets/logo.svg" width="96" height="96" alt="cloudhop logo">
</p>

<h1 align="center">cloudhop</h1>

<p align="center">
  Hop between cloud accounts, roles and regions with one command.<br>
  Automatic login, no access keys.
</p>

<p align="center">

[![Pipeline](https://github.com/dayepesb/cloudhop/actions/workflows/pipeline.yml/badge.svg)](https://github.com/dayepesb/cloudhop/actions/workflows/pipeline.yml)
[![npm](https://img.shields.io/npm/v/cloudhop)](https://www.npmjs.com/package/cloudhop)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

</p>

> 🚧 Early preview. AWS works today; Azure and Google Cloud are planned.

```bash
npm i -g cloudhop
cloudhop setup                            # add an SSO portal or personal account

hop acme-prod s3 ls                       # `aws s3 ls` with the right account, role and region
hop acme-prod                             # who am I?
cloudhop exec acme-prod -- terraform plan # any tool, with temporary credentials
cloudhop ui                               # or manage everything from a local web page
```

## Why

Working with several AWS SSO portals plus personal accounts means copying
access keys, editing `~/.aws/config` by hand and logging in again and again.
cloudhop is a thin proxy over the AWS CLI that:

- Adds SSO portals and personal accounts interactively.
- Discovers every account and role you have access to and creates aliases.
- Logs you in automatically, only when a session has expired, and refreshes
  every account of that portal at the same time.
- Never stores long-lived secrets: it uses AWS IAM Identity Center and
  `aws login` temporary credentials.
- Writes standard profiles to `~/.aws/config`, so Terraform, SDKs and IDEs
  see the same aliases.

## Documentation

[dayepesb.github.io/cloudhop](https://dayepesb.github.io/cloudhop/), in English and Spanish.

## Contributing

```bash
pnpm install
pnpm test        # unit tests
pnpm build && pnpm test:e2e    # CLI end-to-end tests (sandboxed)
pnpm exec playwright install chromium && pnpm test:web   # web UI tests
pnpm audit       # dependency vulnerabilities
pnpm typecheck
pnpm lint
pnpm build       # bundles packages/cli/dist/cli.js
node packages/cli/dist/cli.js --help
pnpm docs:dev    # documentation site
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing the code; it also
explains the pipeline and how releases are approved. Use
`CLOUDHOP_HOME` and `CLOUDHOP_AWS_DIR` to try things without touching your
real configuration.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as
described in [SECURITY.md](SECURITY.md).
