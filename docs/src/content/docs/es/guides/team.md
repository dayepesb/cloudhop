---
title: Comparte con tu equipo
description: Exporta tus portales y alias a un archivo y deja que tus compañeros los importen con un solo comando.
---

Darle acceso a un compañero nuevo suele implicar enviarle las URLs de los
portales y una lista de qué cuentas y roles usar. Mejor dale un solo archivo:

```bash
cloudhop team export --out acme-team.yaml            # todos los portales
cloudhop team export --sources acme,globex           # algunos portales, a la salida estándar
```

Tu compañero ejecuta:

```bash
cloudhop team import acme-team.yaml
cloudhop team import https://raw.githubusercontent.com/acme/platform/main/acme-team.yaml
```

## Qué tiene el archivo

```yaml
# cloudhop team setup: import it with `cloudhop team import <this file or its https URL>`.
# No secrets: portal URLs, regions, account ids and role names only.
version: 1
sources:
  acme:
    provider: aws
    kind: sso
    settings:
      startUrl: https://acme.awsapps.com/start
      region: us-east-1
aliases:
  acme-prod:
    source: acme
    target: 123456789012/AdministratorAccess
    prod: true
  acme-dev:
    source: acme
    target: 210987654321/Developer
    region: us-east-2
```

Sin tokens ni credenciales. Las cuentas personales nunca se exportan. Los ids
de cuenta no son secretos, pero quizás prefieras compartir el archivo dentro
de tu organización y no públicamente.

## Qué hace la importación

1. Revisa el archivo campo por campo (son datos de otra persona) y muestra
   exactamente lo que va a agregar, **incluida la URL de cada portal**:
   asegúrate de que sean de tu organización antes de continuar.
2. Omite lo que ya tienes: un portal que agregaste con otro nombre se
   reutiliza, y los alias cuyo nombre ya usas se dejan como están.
3. Inicia sesión en cada portal nuevo en el navegador.
4. Crea los alias a los que tienes acceso, con su región y su marca de
   producción, y te dice cuáles no pudo crear porque tu usuario no puede usar
   esa cuenta o ese rol.

Usa `--yes` para omitir la confirmación en scripts. Solo se aceptan URLs
`https://`.
