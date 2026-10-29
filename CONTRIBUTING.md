# Contributing to cloudhop

Thanks for helping! Bug reports, docs fixes and new providers are all welcome.

## Ground rules

- Be kind: this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Found a security problem? Do **not** open an issue; see [SECURITY.md](SECURITY.md).
- For anything bigger than a small fix, open an issue first so we can agree on
  the approach before you spend time on it.
- By contributing you agree that your work is licensed under the
  [Apache License 2.0](LICENSE), like the rest of the project.

## Set up

You need Node.js 20+ and [pnpm](https://pnpm.io) (the version in `package.json`).

```bash
git clone https://github.com/dayepesb/cloudhop.git
cd cloudhop
pnpm install
pnpm build
node packages/cli/dist/cli.js --help
```

Point cloudhop at throwaway folders so you never touch your real setup:

```bash
export CLOUDHOP_HOME=$(mktemp -d) CLOUDHOP_AWS_DIR=$(mktemp -d)
```

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck     # Biome + TypeScript
pnpm test                       # unit tests
pnpm build && pnpm test:e2e     # the bundled CLI, sandboxed
pnpm exec playwright install chromium && pnpm test:web   # the web UI
pnpm docs:build                 # if you touched docs/
```

The pipeline runs all of this on Linux, macOS and Windows, plus CodeQL,
a dependency audit and a secret scan.

## How the code is organised

Read [ARCHITECTURE.md](ARCHITECTURE.md). In short: `packages/core` holds the
use cases and knows nothing about AWS, Node or the terminal; providers and
adapters plug into its ports; `packages/cli` and `packages/ui` are the two
ways in. Keep that direction of dependencies.

## Releases

Maintainers bump `version` in `packages/cli/package.json`; after merging to
`main` the pipeline checks the version is free on npm, waits for a maintainer
to approve, then publishes with provenance and deploys the docs.
