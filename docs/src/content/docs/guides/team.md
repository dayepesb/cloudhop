---
title: Share with your team
description: Export your portals and aliases to a file and let teammates import them in one command.
---

Onboarding a teammate usually means sending them portal URLs and a list of
which accounts and roles to use. Give them one file instead:

```bash
cloudhop team export --out acme-team.yaml            # every portal
cloudhop team export --sources acme,globex           # some portals, to standard output
```

They run:

```bash
cloudhop team import acme-team.yaml
cloudhop team import https://raw.githubusercontent.com/acme/platform/main/acme-team.yaml
```

## What's in the file

```yaml
# cloudhop team setup: import it with `cloudhop team import <this file or its https URL>`.
# No secrets: portal URLs, regions, account ids and role names only.
version: 1
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
    prod: true
  acme-dev:
    source: acme
    target: 210987654321/Developer
    region: us-east-2
```

No tokens, no credentials. Personal accounts are never exported. Account ids
aren't secret, but you may still prefer to share the file inside your
organization rather than publicly.

## What import does

1. Checks the file field by field (it's data from someone else) and shows
   exactly what it will add, **including each portal URL**: make sure they
   are your organization's before you continue.
2. Skips what you already have: a portal you added under another name is
   reused, and aliases whose name you already use are left alone.
3. Signs you in to each new portal in the browser.
4. Creates the aliases you have access to, with their region and production
   mark, and tells you which ones it couldn't create because your user can't
   use that account or role.

Use `--yes` to skip the confirmation in scripts. Only `https://` URLs are
accepted.
