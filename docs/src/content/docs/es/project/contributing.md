---
title: Contribuir
description: Reporta errores, sugiere ideas y envía cambios a cloudhop.
---

cloudhop es de código abierto bajo la
[Apache License 2.0](https://github.com/dayepesb/cloudhop/blob/main/LICENSE).
Los reportes de errores, las correcciones a la documentación y los nuevos
proveedores son bienvenidos.

## Formas de ayudar

- **¿Encontraste un error?** [Abre un issue](https://github.com/dayepesb/cloudhop/issues/new/choose)
  con lo que ejecutaste y lo que pasó.
- **¿Tienes una idea?** Abre una solicitud de funcionalidad y describe
  primero el problema.
- **¿Encontraste un problema de seguridad?** Repórtalo
  [de forma privada](https://github.com/dayepesb/cloudhop/security/advisories/new),
  no en un issue.
- **¿Quieres escribir código o documentación?** Sigue leyendo.

## Trabaja en el código

```bash
git clone https://github.com/dayepesb/cloudhop.git
cd cloudhop
pnpm install
pnpm build
node packages/cli/dist/cli.js --help
```

Usa carpetas desechables para nunca tocar tu configuración real:

```bash
export CLOUDHOP_HOME=$(mktemp -d) CLOUDHOP_AWS_DIR=$(mktemp -d)
```

Antes de abrir un pull request:

```bash
pnpm lint && pnpm typecheck
pnpm test
pnpm build && pnpm test:e2e
pnpm exec playwright install chromium && pnpm test:web
```

## Trabaja en esta documentación

La documentación está hecha con [Starlight](https://starlight.astro.build) y
vive en `docs/`. Cada página tiene un enlace **Edita esta página** al final.

```bash
pnpm docs:dev
```

Las páginas existen en inglés (`docs/src/content/docs/`) y en español
(`docs/src/content/docs/es/`); por favor actualiza ambas cuando puedas.

La guía completa es
[CONTRIBUTING.md](https://github.com/dayepesb/cloudhop/blob/main/CONTRIBUTING.md),
y todos seguimos el
[Código de conducta](https://github.com/dayepesb/cloudhop/blob/main/CODE_OF_CONDUCT.md).
