---
title: Protege producción
description: Marca alias como de producción para que cloudhop, y tu asistente de IA, pregunten antes de cambiar algo ahí.
---

Marca los alias que apuntan a producción:

```bash
cloudhop prod acme-prod billing-prod   # marcar
cloudhop prod                          # listar los alias de producción
cloudhop prod acme-prod --off          # desmarcar
```

Cuando creas alias, cloudhop pregunta "Is it production?" y ya sugiere *yes*
para nombres como `prod`, `prd`, `production` o `live`. La interfaz web tiene
una casilla **Prod** en cada alias. Los alias de producción muestran una
etiqueta roja **PROD** en `cloudhop ls`, `cloudhop status`, la interfaz web y
el selector de alias.

## Qué cambia en un alias de producción

- **Leer es libre.** `hop acme-prod s3 ls`, `describe-*`, `list-*`, `get-*`,
  `logs tail`, las descargas (`s3 cp s3://… ./`) y cualquier cosa con
  `--dryrun` se ejecutan de inmediato, con un recordatorio en rojo de que
  estás en producción.
- **Cambiar pregunta primero.** Cualquier otra cosa, y todo aquello de lo que
  cloudhop no esté seguro, muestra el alias, la cuenta, la región y el comando
  exacto, y pregunta *Run it in acme-prod?* con **No** como respuesta
  predeterminada.

  ```text
  ▲  PRODUCTION  acme-prod → acme-production / AdministratorAccess, us-east-1
     This may change resources: aws s3 rm s3://reports/2024.csv
  ◆  Run it in acme-prod?
  │  ○ Yes / ● No
  ```

- **`cloudhop exec`** siempre pregunta en los alias de producción, porque
  cloudhop no puede saber qué hará otra herramienta (Terraform, un script).
- **`cloudhop each`** pregunta una vez más por los alias de producción de la
  selección cuando el comando puede cambiar algo.

## Scripts y asistentes de IA

Sin una terminal no hay a quién preguntarle, así que los cambios en
producción se rechazan con `PROD_CONFIRMATION_REQUIRED`. Cuando una persona
haya aprobado ese comando exacto, define `CLOUDHOP_CONFIRM_PROD=1` para él:

```bash
CLOUDHOP_CONFIRM_PROD=1 hop acme-prod s3 rm s3://reports/2024.csv
```

La [skill para asistentes de IA](/cloudhop/es/guides/ai-assistants/) le
enseña a tu asistente justo esto: mostrarte el comando, esperar tu *sí* y
solo entonces volver a ejecutarlo con esa variable (o, a través de MCP, con
`confirm_production: true`). Nunca debe definirla por su cuenta.

:::caution[Qué protege esto]
La protección cubre los comandos que pasan por cloudhop: `hop`,
`cloudhop exec`, `cloudhop each` y el servidor MCP. Un comando `aws` normal en
una shell donde ejecutaste `cloudhop use acme-prod`, o Terraform apuntando
directamente al perfil, no se interceptan; cloudhop te lo recuerda cuando
haces `use` de un alias de producción. Es un cinturón de seguridad contra
errores, no un reemplazo de los permisos de IAM.
:::
