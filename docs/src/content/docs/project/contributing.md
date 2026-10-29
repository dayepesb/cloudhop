---
title: Contributing
description: Report bugs, suggest ideas and send changes to cloudhop.
---

cloudhop is open source under the
[Apache License 2.0](https://github.com/dayepesb/cloudhop/blob/main/LICENSE).
Bug reports, documentation fixes and new providers are all welcome.

## Ways to help

- **Found a bug?** [Open an issue](https://github.com/dayepesb/cloudhop/issues/new/choose)
  with what you ran and what happened.
- **Have an idea?** Open a feature request and describe the problem first.
- **Found a security problem?** Report it
  [privately](https://github.com/dayepesb/cloudhop/security/advisories/new),
  not in an issue.
- **Want to write code or docs?** Read on.

## Work on the code

```bash
git clone https://github.com/dayepesb/cloudhop.git
cd cloudhop
pnpm install
pnpm build
node packages/cli/dist/cli.js --help
```

Use throwaway folders so you never touch your real setup:

```bash
export CLOUDHOP_HOME=$(mktemp -d) CLOUDHOP_AWS_DIR=$(mktemp -d)
```

Before opening a pull request:

```bash
pnpm lint && pnpm typecheck
pnpm test
pnpm build && pnpm test:e2e
pnpm exec playwright install chromium && pnpm test:web
```

## Work on these docs

The docs are built with [Starlight](https://starlight.astro.build) and live in
`docs/`. Every page has an **Edit page** link at the bottom.

```bash
pnpm docs:dev
```

Pages exist in English (`docs/src/content/docs/`) and Spanish
(`docs/src/content/docs/es/`); please update both when you can.

The full guide is
[CONTRIBUTING.md](https://github.com/dayepesb/cloudhop/blob/main/CONTRIBUTING.md),
and everyone follows the
[Code of Conduct](https://github.com/dayepesb/cloudhop/blob/main/CODE_OF_CONDUCT.md).
