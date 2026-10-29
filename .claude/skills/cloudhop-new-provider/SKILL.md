---
name: cloudhop-new-provider
description: Step-by-step guide to add a new cloud provider to cloudhop (Azure, Google Cloud or another cloud) by implementing the CloudProvider port. Use when someone wants to add Azure or GCP support, implement a provider, or pick up a provider issue from the cloudhop backlog.
---

# Adding a cloud provider to cloudhop

A provider teaches cloudhop how to sign in to one cloud, discover what the
user can access, and run that cloud's CLI as an alias. The core, the CLI and
the web UI need no changes: they are driven by what the provider describes.
Use `packages/provider-aws` as the reference implementation.

## 1. Learn the cloud's model first

Answer these before writing code, and write the answers in the PR:

- **Source**: where does the user sign in once? (Azure: a tenant via
  `az login`; GCP: a Google account via `gcloud auth login`.)
- **Target**: what does an alias point to? (Azure: subscription (+ tenant);
  GCP: project (+ account, optionally a service account to impersonate).)
- **Region**: is there a default location/region to set per alias?
- **Session**: how do you tell valid / renewable / expired, and how is it
  renewed without a browser?
- **How the CLI picks the target**: environment variables or config files
  (Azure: `AZURE_CONFIG_DIR`, `az account set`; GCP: `CLOUDSDK_CONFIG`,
  `CLOUDSDK_CORE_PROJECT`, named configurations).
- **Credentials for `cloudhop exec`**: what env vars do SDKs read?
- Never introduce long-lived secrets (no service-account key files).

## 2. Create the package

```text
packages/provider-<id>/
  package.json          name @cloudhop/provider-<id>, private, deps: @cloudhop/core
  src/index.ts          export the provider class
  src/<id>-provider.ts  implements CloudProvider
  src/<id>-provider.test.ts
```

`<id>` must be in `ProviderId` / `PROVIDER_IDS` (`core/src/domain/model.ts`);
`azure` and `gcp` already are.

## 3. Implement `CloudProvider` (`core/src/ports/cloud-provider.ts`)

| Member | What to provide |
| --- | --- |
| `id`, `displayName` | `'azure'`, `'Azure'` |
| `cli` | `{ command: 'az', displayName: 'Azure CLI', minVersion }` |
| `sourceKinds` | Each way to add a source: `kind`, `label`, `hint`, `nameLabel`, and `fields` with `validate`. The CLI wizard, the flags (`--<field-key>`) and the web form are generated from this. |
| `sessionState(source)` | `'valid' \| 'refreshable' \| 'expired' \| 'unknown'`, cheaply (no browser) |
| `refreshSession(source)` | Renew silently; return `false` if it needs the user |
| `login(source, interaction)` | Interactive sign-in; open URLs with `interaction.openBrowser`, show codes with `interaction.notify` |
| `discoverTargets(source)` | Every target the user can access, as `{ id, label, attributes }`. `id` must be stable; `label` is what users read ("Subscription name / Tenant"). |
| `syncProfiles(sources, aliases)` | Write whatever the cloud CLI needs to find aliases, only in files/blocks cloudhop owns |
| `processEnv(alias, 'cli' \| 'credentials')` | Env vars to run the CLI as the alias, or to give any tool its temporary credentials. `undefined` removes a variable. |
| `isSessionError(output)` | Recognise the CLI's "session expired / please log in" messages so cloudhop logs in and retries once |

Run external processes through the injected `ProcessRunner`, never
`child_process` directly, so tests can fake them.

## 4. Wire it up

1. Register it in `packages/cli/src/container.ts`.
2. Add install recipes for its CLI in
   `packages/adapters-node/src/system-tool-installer.ts` (brew / winget /
   manual URL); `az` and `gcloud` may already have one, check it.
3. Add it as a dev dependency of `packages/cli` so tsup bundles it.

## 5. Test

- Unit tests with a fake `ProcessRunner`/`fetch`: session states, target
  discovery, `processEnv` for both modes, `isSessionError` samples taken from
  the real CLI.
- An e2e test in `e2e/` with a sandboxed config if the provider writes files.
- Manually: add a source, create aliases, run `hop <alias>`, let the session
  expire and run again.

## 6. Document

- A guide page `docs/src/content/docs/guides/<id>.md` and its Spanish copy in
  `docs/src/content/docs/es/guides/`, plus sidebar entries in
  `docs/astro.config.mjs`.
- Update `reference/commands.md`, the README and the home page cards.

Follow the rules in the `cloudhop-architecture` skill for everything else.
