---
title: Aliases and regions
description: Create, rename, change the region of and remove aliases.
---

An alias is your short name for an account, a role and a region. It's what you
type after `hop`.

## Create aliases

Right after adding a source, cloudhop lets you pick accounts and name them. To
add more later:

```bash
cloudhop alias acme
```

Tick the accounts and roles you want (type to filter). For each one, cloudhop
asks for:

- **The alias.** Lowercase letters, numbers, `-` and `_`. Pick something you
  can type fast: `acme-prod`, `billing-ro`, `sandbox`.
- **The region.** It defaults to the portal's region. If you type another
  one, it becomes the default for the next alias, so a batch in the same
  region needs no retyping.

Some names are reserved because they are commands: `add`, `alias`, `login`,
`region`, `setup`, `sync`, `ls`, `list`, `rm`, `remove`, `doctor`, `exec`,
`provider`, `ui`, `help` and `version`.

## Change the region of an alias

```bash
cloudhop region acme-prod eu-west-1     # straight away
cloudhop region acme-prod               # asks, suggesting the current one
cloudhop region                         # pick the alias from a list
```

For company portals the profile in `~/.aws/config` changes too, so other
tools follow. cloudhop rejects typos such as `us-wst-1`.

Need another region just once? Pass it to the command:

```bash
hop acme-prod s3 ls --region ap-southeast-2
cloudhop exec acme-prod --region ap-southeast-2 -- terraform plan
```

## Rename an alias

```bash
cloudhop mv globex-northwind-prod-01-globex-prod-ps-support-ops northwind-prod
```

The account, role, region and production mark stay, and so does its AWS
profile (renamed too). In the web UI, use the ✎ button.

## Short names by default

When you create aliases, cloudhop suggests short names from the account: it
drops the portal's own prefix and trailing numbers (`Globex_Northwind_Prod_01`
in the `globex` portal becomes `northwind-prod`) and adds the role only when
the same account has several (`contoso-prod-admin`, `contoso-prod-support-ops`).

## Production aliases

cloudhop asks whether each new alias is production (and suggests *yes* for
names like `prod` or `live`). Production aliases ask before any change. See
[Protect production](/cloudhop/guides/production/).

## Remove aliases and sources

```bash
cloudhop rm acme-dev                 # an alias
cloudhop rm acme-dev acme-qa         # several
cloudhop rm acme                     # a whole source and its aliases (asks first)
cloudhop rm acme --yes               # without asking, for scripts
```

If an alias and a source share a name, `cloudhop rm <name>` removes the
alias; use `cloudhop rm --source <name>` for the source.

## See everything

```bash
cloudhop ls          # every source with its aliases
cloudhop ls acme     # just one source
```
