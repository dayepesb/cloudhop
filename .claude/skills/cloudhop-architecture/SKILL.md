---
name: cloudhop-architecture
description: How the cloudhop codebase is organised and the rules every change must follow. Use before adding or changing any cloudhop feature, command, port, adapter, web UI screen or doc page, when deciding which package code belongs in, or when reviewing a cloudhop pull request.
---

# cloudhop architecture

cloudhop is a hexagonal (ports and adapters) TypeScript monorepo bundled into
one npm package (`cloudhop`, binaries `cloudhop` and `hop`). The full design is
in `ARCHITECTURE.md`; read it once. These are the rules that matter day to day.

## Where code goes

| Package | Owns | May import |
| --- | --- | --- |
| `packages/core` | Domain model, errors, use cases (`CloudhopApp`), port interfaces | nothing (no Node APIs, no AWS) |
| `packages/provider-aws` | The AWS `CloudProvider`: SSO OIDC + portal over `fetch`, `aws login`, `~/.aws/config` block, token cache | `core`, Node |
| `packages/adapters-node` | `ConfigStore` (YAML), `ProcessRunner`, `BrowserOpener`, `ToolInstaller` | `core`, Node, `yaml` |
| `packages/cli` | Commands, prompts (`@clack/prompts`), flags, composition root (`src/container.ts`) | everything |
| `packages/ui` | `cloudhop ui`: loopback server, JSON API over `CloudhopApp`, framework-free page | `core`, `assistants`, Node |
| `packages/mcp` | `cloudhop mcp`: stdio MCP server; stdout is protocol only, tools never open a browser by themselves | `core`, Node |
| `packages/assistants` | `cloudhop agent`: the bundled skill (`src/assets/skill.md`) and where each AI assistant keeps skills and MCP settings | `core`, Node |

- Business rules live in `core`. If a command or the web UI needs new
  behaviour, add a `CloudhopApp` method and call it from both.
- Provider-specific knowledge (labels, fields, validation, file formats) lives
  in the provider and reaches the CLI and UI through `sourceKinds`. Never
  hard-code `'aws'`, `'sso'` or `'console-login'` in `cli` or `ui`.
- Only `packages/cli/src/container.ts` instantiates concrete adapters.

## Adding a CLI command

1. Use case in `core` (`CloudhopApp`), unit-tested with the in-memory fakes in
   `cloudhop-app.test.ts`.
2. Command in `packages/cli/src/commands/`, wired in `cli.ts` (switch + `HELP`).
3. Add the name to `RESERVED_NAMES` in `core/src/domain/naming.ts` so no alias
   can shadow it.
4. It must work without a terminal: every prompt needs a flag equivalent, and
   `requireInteractive()` explains which flag to use.
5. Errors users can act on are `CloudhopError(code, message, hint)`.
6. Expose it in the web UI if it changes sources or aliases (`packages/ui/src/api.ts`
   + `assets/app.js`).

## Safety rules (do not break)

- Never store long-lived credentials; never write `~/.aws/credentials`.
- Only edit `~/.aws/config` inside the `# >>> cloudhop managed >>>` block, and
  refuse to overwrite hand-written profiles (`ALIAS_EXISTS`).
- A source whose first login fails must not be saved (`connectSource`).
- The web UI stays on `127.0.0.1` with the per-run token, Host/Origin checks
  and strict CSP; API responses never include tokens.
- `hop` strips inherited `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`.
- Production aliases (`prod: true`): every path that runs a command (`hop`,
  `exec`, `each`, MCP `run_cloud_cli`) must call
  `needsProductionConfirmation` and ask, or refuse with
  `PROD_CONFIRMATION_REQUIRED` without a terminal (`CLOUDHOP_CONFIRM_PROD=1`
  is the only override). A provider's `isReadOnly` must return false when
  unsure.
- Console sign-in URLs are secrets: only `CloudhopApp.openConsole` sees them;
  never print, log or return them to the web UI or MCP.
- `cloudhop __complete` runs on every Tab: keep it fast and side-effect free.

## Tests and checks

```bash
pnpm lint && pnpm typecheck
pnpm test                      # unit (vitest)
pnpm build && pnpm test:e2e    # bundled CLI in a sandbox (e2e/sandbox.ts)
pnpm test:web                  # Playwright against cloudhop ui
pnpm docs:build
```

- E2E tests never touch the network or the real config: use `sandbox()` from
  `e2e/sandbox.ts` (temp `CLOUDHOP_HOME`/`CLOUDHOP_AWS_DIR`, fake SSO token).
- Use neutral example names (`acme`, `acme-prod`, `123456789012`), never real
  organisations, portals or account ids.

## Docs

User-facing changes update the Starlight docs in `docs/src/content/docs/`
**and** the Spanish copy under `docs/src/content/docs/es/` (same slug, links
prefixed `/cloudhop/es/`). Command changes also update
`reference/commands.md` and the CLI `HELP` text.
