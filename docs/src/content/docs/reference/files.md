---
title: Configuration and files
description: What cloudhop stores, where, and what it never touches.
---

cloudhop keeps its own settings in one folder and writes standard AWS files
in the format the AWS CLI already uses. It never writes `~/.aws/credentials`.

| File | Written by | Contains | Secrets? |
| --- | --- | --- | --- |
| `~/.config/cloudhop/config.yaml` | cloudhop | Enabled clouds, sources and aliases | No |
| `~/.config/cloudhop/targets.json` | cloudhop | Cache of the accounts and roles of each source | No |
| `~/.config/cloudhop/assistants.json` | `cloudhop agent` | Which assistant skills cloudhop installed, to keep them up to date | No |
| `~/.config/cloudhop/update-check.json` | cloudhop | When npm was last checked and the latest version | No |
| `~/.config/cloudhop/trusted-folders.json` | `cloudhop allow`, `use --save` | The `.cloudhoprc` files you trusted, with a fingerprint of their content | No |
| `~/.config/starship.toml` | `cloudhop shell`, only if you use Starship | A marked `# >>> cloudhop >>>` block and the alias segments in `format` (backup: `starship.toml.cloudhop-backup`) | No |
| `.cloudhoprc` in a project | `cloudhop use --save`, or you | The alias each cloud uses in that folder, like `aws: license-qa` | No |
| Assistant skills and MCP settings | `cloudhop agent install` | See [AI assistants](/cloudhop/guides/ai-assistants/) for every path | No |
| `~/.aws/config` | cloudhop, only inside its block | One `sso-session` per portal, one profile per alias | No |
| `~/.aws/sso/cache/<hash>.json` | cloudhop, like `aws sso login` | The SSO session: access and refresh tokens, expiry | Short-lived tokens, not access keys |
| `~/.aws/credentials` | never | Nothing from cloudhop | |

Files cloudhop creates are readable only by your user (`0600`).

## `config.yaml`

You can read it, but change it with cloudhop commands:

```yaml
# cloudhop configuration. Contains no secrets.
providers:
  - aws
sources:
  acme:
    provider: aws
    kind: sso
    settings:
      startUrl: https://acme.awsapps.com/start
      region: us-east-1
aliases:
  acme-prod:
    source: acme
    target: 123456789012/AdministratorAccess
  acme-dev:
    source: acme
    target: 210987654321/Developer
    region: us-east-2      # only when it differs from the source's region
```

Move the folder with `CLOUDHOP_HOME`, or with `XDG_CONFIG_HOME` if you use it.

## `.cloudhoprc`

A folder file: with the shell integration, `cd` into the
folder (or any folder inside it) switches the terminal to these aliases.

```text
# cloudhop: aliases for this folder
aws: license-qa
```

One `cloud: alias` line per cloud, or just an alias name on its own. A file
does nothing until you trust it with `cloudhop allow`; editing it needs a new
`cloudhop allow`. See [Use an alias in your terminal](/cloudhop/guides/shell/#pin-an-alias-to-a-folder-cloudhoprc).

## The block in `~/.aws/config`

cloudhop writes between two markers and leaves everything else alone, so
your hand-written profiles stay as they are:

```ini
[default]
region = us-east-1

# >>> cloudhop managed >>> (edit with `cloudhop`, not by hand)
[sso-session cloudhop-acme]
sso_start_url = https://acme.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile acme-prod]
sso_session = cloudhop-acme
sso_account_id = 123456789012
sso_role_name = AdministratorAccess
region = us-east-1
# <<< cloudhop managed <<<
```

If you create an alias whose name already exists as a hand-written profile,
cloudhop stops and tells you instead of overwriting it.

## The SSO token cache

The session is saved in `~/.aws/sso/cache/`, in the same format and place as
`aws sso login`. That is why the AWS CLI, Terraform and the SDKs reuse the
session cloudhop opened without asking you to sign in again.

## Uninstall

```bash
cloudhop rm <every source> --yes   # removes aliases and their profiles
npm uninstall --global cloudhop
rm -rf ~/.config/cloudhop
```

Or delete the `cloudhop managed` block from `~/.aws/config` by hand: your
file is then exactly as it was before cloudhop.
