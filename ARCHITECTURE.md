# Architecture

cloudhop is a thin proxy over the official cloud CLIs (`aws`, later `az` and
`gcloud`). It owns three things: **who you can be** (sources, targets and
aliases), **making sure you are logged in** right when you need it, and
**running the real CLI** with the right identity and region.

This document describes how the code is organised and why. Decisions that
shape the project are recorded as ADRs at the end.

## Goals

- **Least friction.** One login per portal; the browser opens only when a
  session can't be renewed silently.
- **No long-lived secrets.** Only temporary credentials (AWS IAM Identity
  Center, `aws login`). cloudhop never stores access keys in plain text.
- **Plays well with others.** Profiles are written to `~/.aws/config` so
  Terraform, SDKs and IDEs see the same aliases.
- **Multi-cloud ready.** AWS first; Azure and Google Cloud plug into the same
  core without changing it.

## Hexagonal architecture (ports and adapters)

```text
             PRIMARY ADAPTERS (how users get in)
        ┌──────────────┐          ┌──────────────┐
        │  packages/   │          │  packages/   │
        │     cli      │          │      ui      │
        └──────┬───────┘          └──────┬───────┘
               ▼                         ▼
   ┌───────────────────────────────────────────────┐
   │ packages/core                                 │
   │                                               │
   │  application/  use cases (CloudhopApp)        │
   │    runAsAlias · ensureSession · syncSource    │
   │    addSource · addAliases · doctor · ...      │
   │                                               │
   │  domain/  Source, Target, Alias, Session,     │
   │           validation rules, errors            │
   │                                               │
   │  ports/   CloudProvider · ConfigStore ·       │
   │           ProcessRunner · BrowserOpener ·     │
   │           ToolInstaller                       │
   └───────────────────────────────────────────────┘
               ▲                         ▲
        ┌──────┴────────┐        ┌───────┴─────────┐
        │ packages/     │        │ packages/       │
        │ provider-aws  │        │ adapters-node   │
        │ (azure, gcp   │        │ YAML store,     │
        │  later)       │        │ processes,      │
        └───────────────┘        │ browser, brew   │
                                 └─────────────────┘
             SECONDARY ADAPTERS (what the core talks to)
```

**Dependency rule:** arrows point inwards. `core` imports nothing from Node,
AWS or the terminal. Adapters import `core` and implement its ports. Only the
composition root (`packages/cli/src/container.ts`) knows every concrete
class.

### Packages

| Package | Role | May depend on |
| --- | --- | --- |
| `core` | Domain model, use cases, port interfaces | nothing |
| `provider-aws` | `CloudProvider` for AWS: SSO (OIDC + portal API over HTTP), `aws login`, `~/.aws/config` and SSO token cache | `core`, Node |
| `adapters-node` | `ConfigStore` (YAML), `ProcessRunner`, `BrowserOpener`, `ToolInstaller` | `core`, Node, `yaml` |
| `cli` | Commands, interactive prompts, composition root. **Published to npm as `cloudhop`** | everything |
| `mcp` | `cloudhop mcp`: a Model Context Protocol server over stdio (hand-written JSON-RPC, no runtime dependencies) exposing read-only tools plus `login` and `run_cloud_cli` | `core`, Node |
| `assistants` | `cloudhop agent`: installs the cloudhop skill (one `SKILL.md`, bundled) and registers the MCP server in Claude Code, Kiro, Copilot, Cursor and Codex; refreshes installed skills after upgrades | `core`, Node |
| `ui` | Local web page (`cloudhop ui`): a loopback HTTP server, a JSON API over the same use cases and a framework-free page | `core`, Node |

Internal packages are private (`@cloudhop/*`, never published). `tsup`
bundles them into the single `cloudhop` package, so users install one thing.
If a provider ever becomes heavy, it can be published on its own without
rewriting anything.

## Core concepts

| Concept | Meaning | AWS example |
| --- | --- | --- |
| **Provider** | A cloud | `aws` |
| **Source** | Somewhere you log in once | SSO portal `https://acme.awsapps.com/start`, or a personal account via `aws login` |
| **Target** | An identity you can act as inside a source | account `123456789012` + role `AdminAccess` |
| **Alias** | Your short name for source + target + region | `acme-prod` → acme / 123456789012 / AdminAccess / us-east-1 |
| **Session** | The login state of a source | `valid`, `refreshable`, `expired`, `unknown` |

## Key flow: `hop acme-prod s3 ls`

```text
cli  ──► CloudhopApp.runAsAlias("acme-prod", ["s3","ls"])
           │
           ├─ resolve alias → source "acme", target 123456789012/AdminAccess
           ├─ ensureSession(acme)
           │     valid       → continue (reads a local file, no network)
           │     refreshable → provider.refreshSession()   (silent)
           │     expired     → provider.login()  (opens the browser)
           │                   └─ syncSource(): rediscover every account/role,
           │                      rewrite profiles, report added/removed
           ├─ provider.processEnv(alias)  → AWS_PROFILE, AWS_REGION
           ├─ runner.run("aws", ["s3","ls"], env)
           └─ if it fails and the output looks like an expired session:
                 login → sync → retry once
```

Sessions are only checked when you use an alias. Nothing runs in the
background.

## Files on disk

| Path | Owner | Contents |
| --- | --- | --- |
| `~/.config/cloudhop/config.yaml` | cloudhop | Enabled providers, sources, aliases (no secrets) |
| `~/.config/cloudhop/targets.json` | cloudhop | Cache of discovered targets per source |
| `~/.aws/config` | shared | cloudhop only edits the block between `# >>> cloudhop managed >>>` markers |
| `~/.aws/sso/cache/*.json` | shared | SSO tokens in the AWS CLI format, so `aws` and SDKs reuse them |

`CLOUDHOP_HOME` overrides the config directory (useful for tests).

## Missing cloud CLIs

Logging in and getting credentials never need the cloud CLI for SSO sources.
The CLI is only needed to proxy commands (and for `aws login`). When it is
missing, `cloudhop doctor` and `cloudhop setup` show the official install
command for the platform (Homebrew, winget, official installers) and run it
only after the user confirms.

## Adding a provider

1. Create `packages/provider-<id>` implementing `CloudProvider` from `core`.
2. Describe its source kinds (the fields the setup wizard asks for).
3. Register it in `packages/cli/src/container.ts`.
4. Add install recipes for its CLI in `adapters-node`.

The core, the CLI commands and the web UI need no changes: the UI builds its
forms from the provider's source kinds.

## Web UI security

`cloudhop ui` exposes the same actions as the CLI, so it is locked to the
person at the keyboard:

- It listens on `127.0.0.1` only, on a random port unless `--port` is given.
- Every API call needs a random per-run token. The token travels in the URL
  fragment (never sent to the server in the request line or a Referer) and
  then in a custom header, which other sites cannot set without a CORS
  preflight that the server never approves.
- Requests whose `Host` or `Origin` is not the loopback address are rejected,
  which blocks DNS rebinding.
- A strict Content-Security-Policy allows only the page's own script.
- The API returns what `cloudhop ls` shows; tokens and credentials never
  leave the token cache.

## Testing

- **Use cases** are tested with in-memory fakes of every port: no AWS, no
  browser, no filesystem.
- **Adapters** are tested on their pure parts (rendering `~/.aws/config`,
  reading token caches, recognising expired-session errors) and with a fake
  `fetch` for HTTP calls.
- **CLI end-to-end** (`e2e/*.e2e.test.ts`) runs the bundled `dist/cli.js` in a
  sandbox (`CLOUDHOP_HOME`, `CLOUDHOP_AWS_DIR` and a fake SSO token in temp
  folders): no network, no real configuration.
- **Web UI end-to-end** (`e2e/web`) starts `cloudhop ui` on the same sandbox
  and drives it with Playwright in Chromium.

## Pipeline and releases

`.github/workflows/pipeline.yml` runs on every push and pull request:

| Stage | Jobs |
| --- | --- |
| Quality | Biome lint, TypeScript |
| Tests | unit + CLI end-to-end on Linux, macOS and Windows; web UI in Chromium |
| Security | CodeQL (`security-extended`), `pnpm audit`, gitleaks secret scan, dependency review on PRs |
| Build | packs the npm tarball once and installs it as a user would; builds the docs |
| Approval | on `main` only: waits for a reviewer to approve the `release` environment |
| Deploy | publishes that same tarball to npm (trusted publishing, provenance) and the docs to GitHub Pages |

To release, bump `version` in `packages/cli/package.json` and merge to `main`,
then approve the run in GitHub. A version that is already on npm is skipped,
so approving a docs-only change only redeploys the docs. Actions are pinned to
commit SHAs and Dependabot keeps them and the dependencies up to date.

## Decision records

### ADR-001: Hexagonal architecture

Several entry points (CLI, web UI) and several outside systems (clouds,
files, browser, processes) meet in one set of rules. Ports and adapters keep
those rules testable and let each side grow independently. No dependency
injection framework: dependencies are passed through constructors and wired
in one place.

### ADR-002: One npm package, built-in providers

Providers are small because the heavy lifting is done by the official CLIs.
Shipping them in one package avoids plugin installation problems (global npm
permissions, mismatched versions). Users enable the clouds they use; enabling
installs nothing.

### ADR-003: Native SSO, AWS-compatible storage

cloudhop implements the IAM Identity Center login (OIDC with PKCE, device
code as fallback) over plain HTTP instead of the AWS SDK, keeping the package
small. Tokens and profiles are stored in the formats the AWS CLI reads, so
both tools share one session.

### ADR-004: Personal accounts via `aws login`

Personal accounts use `aws login` (AWS CLI 2.32+): temporary console
credentials, no IAM Identity Center to enable, no access keys. Access keys in
the OS keychain may be added later as a fallback.
