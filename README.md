# cloudhop

> 🚧 Early preview. AWS works today; Azure and Google Cloud are planned.

Hop between cloud accounts, roles and regions with one command.

```bash
npm i -g cloudhop
cloudhop setup             # pick your clouds, add an SSO portal or personal account

hop acme-prod s3 ls          # runs `aws s3 ls` with the right account, role and region
hop acme-prod                # who am I?
cloudhop exec acme-prod -- terraform plan
cloudhop ui                # or manage everything from a local web page
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

https://dayepesb.github.io/cloudhop (English and Spanish).

## Contributing

```bash
pnpm install
pnpm test        # unit tests
pnpm typecheck
pnpm lint
pnpm build       # bundles packages/cli/dist/cli.js
node packages/cli/dist/cli.js --help
pnpm docs:dev    # documentation site
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing the code. Use
`CLOUDHOP_HOME` and `CLOUDHOP_AWS_DIR` to try things without touching your
real configuration.

## License

MIT
