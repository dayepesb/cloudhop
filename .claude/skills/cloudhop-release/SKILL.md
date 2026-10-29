---
name: cloudhop-release
description: How cloudhop versions are released to npm and the docs site through the GitHub Actions pipeline with a manual approval. Use when preparing a cloudhop release, bumping its version, or when the pipeline's version check, approval, npm publish or docs deploy fails.
---

# Releasing cloudhop

Releases are fully automated except for one human approval. Nobody publishes
from a laptop: npm only accepts publishes from the pipeline (trusted
publishing, provenance).

## Steps

1. Pick the version (semver): breaking change → major, feature → minor, fix →
   patch.
2. Set it in `packages/cli/package.json` (the only versioned package; the
   internal `@cloudhop/*` packages stay `0.0.0` and private).
3. Make sure `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
   pass locally, then merge to `main`.
4. The `Pipeline` workflow runs: quality, tests on 3 OSes, web tests, CodeQL,
   audit, secret scan, package, docs build, then **Check version on npm**:
   - newer than `latest` and unpublished → it will publish;
   - already published → npm is skipped, only the docs deploy;
   - not newer than `latest` → the run fails; bump the version.
5. A maintainer approves the `release` environment in the run
   (**Review deployments**). Then **Publish to npm** and **Deploy docs** run.
6. Verify: `npm view cloudhop version`, `npm audit signatures`, and
   https://dayepesb.github.io/cloudhop/.

## Things that are easy to get wrong

- `npm publish` must receive `./pkg/<file>.tgz` (with `./`), or npm reads it
  as a GitHub `owner/repo`.
- The tarball is built once in the `package` job and that exact file is
  published; don't rebuild in the publish job.
- Actions must be pinned to full commit SHAs (the repo enforces it) and only
  GitHub-owned actions plus `pnpm/action-setup` and `gitleaks/gitleaks-action`
  are allowed. Adding another third-party action requires allowing it in the
  repository settings first.
- A published version can never change. Fix forward with a new version.
