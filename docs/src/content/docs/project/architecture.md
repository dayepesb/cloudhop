---
title: Architecture
description: How cloudhop is built, for contributors.
---

cloudhop uses a hexagonal (ports and adapters) architecture: the core knows
nothing about AWS, Node or the terminal, and everything else plugs into it.

```text
        cli (terminal)           ui (local web page)
               │                         │
               ▼                         ▼
   ┌──────────────────────────────────────────────┐
   │ core: use cases (CloudhopApp) and the domain │
   │ ports: CloudProvider, ConfigStore,           │
   │        ProcessRunner, BrowserOpener, ...     │
   └──────────────────────────────────────────────┘
               ▲                         ▲
     provider-aws (SSO, aws login,   adapters-node (YAML config,
     ~/.aws/config, token cache)     processes, browser, installers)
```

| Package | Role |
| --- | --- |
| `core` | Domain model, use cases and port interfaces. No dependencies. |
| `provider-aws` | The AWS `CloudProvider`: SSO over HTTP, `aws login`, `~/.aws/config` and the token cache. |
| `adapters-node` | Config file, processes, browser and CLI installers. |
| `cli` | Commands, prompts and the composition root. Published as `cloudhop`. |
| `ui` | The local web server and page behind `cloudhop ui`. |

Everything is bundled into the single `cloudhop` npm package, with no runtime
dependencies. Azure and Google Cloud will be new providers plugged into the
same core; the CLI and the web UI build their forms from what each provider
describes, so they need no changes.

The full design, with the key flows, decision records, testing approach and
release pipeline, lives in
[ARCHITECTURE.md](https://github.com/dayepesb/cloudhop/blob/main/ARCHITECTURE.md).
