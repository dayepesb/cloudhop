---
title: Arquitectura
description: Cómo está construido cloudhop, para quienes contribuyen.
---

cloudhop usa una arquitectura hexagonal (puertos y adaptadores): el núcleo no
sabe nada de AWS, Node ni la terminal, y todo lo demás se conecta a él.

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

| Paquete | Función |
| --- | --- |
| `core` | Modelo de dominio, casos de uso e interfaces de los puertos. Sin dependencias. |
| `provider-aws` | El `CloudProvider` de AWS: SSO por HTTP, `aws login`, `~/.aws/config` y la caché de tokens. |
| `adapters-node` | Archivo de configuración, procesos, navegador e instaladores de CLIs. |
| `cli` | Comandos, preguntas interactivas y la raíz de composición. Se publica como `cloudhop`. |
| `ui` | El servidor web local y la página detrás de `cloudhop ui`. |

Todo se empaqueta en el único paquete de npm `cloudhop`, sin dependencias en
tiempo de ejecución. Azure y Google Cloud serán nuevos proveedores conectados
al mismo núcleo; el CLI y la interfaz web construyen sus formularios a partir
de lo que describe cada proveedor, así que no necesitan cambios.

El diseño completo, con los flujos clave, los registros de decisiones, el
enfoque de pruebas y el pipeline de publicación, está en
[ARCHITECTURE.md](https://github.com/dayepesb/cloudhop/blob/main/ARCHITECTURE.md).
