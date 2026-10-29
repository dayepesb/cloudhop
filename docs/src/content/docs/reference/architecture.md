---
title: Architecture
description: How cloudhop is built, for contributors.
---

cloudhop uses a hexagonal (ports and adapters) architecture:

- **`core`**: domain model, use cases and port interfaces. No dependencies.
- **`provider-aws`**: the AWS implementation of the `CloudProvider` port.
- **`adapters-node`**: config file, processes, browser and installers.
- **`cli`**: commands and the composition root. Published as `cloudhop`.

Everything is bundled into the single `cloudhop` npm package. Azure and
Google Cloud will be new providers plugged into the same core.

The full design, with diagrams and decision records, lives in
[ARCHITECTURE.md](https://github.com/dayepesb/cloudhop/blob/main/ARCHITECTURE.md).
