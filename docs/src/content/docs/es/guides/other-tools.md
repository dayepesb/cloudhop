---
title: Uso con otras herramientas
description: Terraform, los SDKs de AWS, los IDEs y cualquier otra herramienta, mediante perfiles o cloudhop exec.
---

Tus alias sirven para mucho más que `hop`. Hay dos formas de usarlos en otros
lugares.

## Opción 1: perfiles de AWS

Cada alias de un portal de empresa es un perfil en `~/.aws/config` con el
mismo nombre, así que cualquier cosa que entienda perfiles de AWS puede
usarlo:

```bash
aws s3 ls --profile acme-prod
AWS_PROFILE=acme-prod terraform plan
AWS_PROFILE=acme-prod npm run deploy        # una app que usa el SDK de AWS
```

En Terraform:

```hcl
provider "aws" {
  profile = "acme-prod"
}
```

En AWS Toolkit para VS Code o JetBrains, elige el perfil de la lista.

Para una [cuenta personal](/cloudhop/es/guides/personal-accounts/) el perfil
es `cloudhop-<source name>` (por ejemplo `cloudhop-personal`), el mismo en el
que inicia sesión `aws login`.

La herramienta lee la sesión que guardó cloudhop. Si venció, ejecuta
cualquier comando `hop` o `cloudhop login acme` para renovarla y vuelve a
intentarlo.

## Opción 2: `cloudhop exec`

`cloudhop exec` ejecuta cualquier comando con las credenciales temporales
del alias en el entorno, y antes renueva la sesión si hace falta:

```bash
cloudhop exec acme-prod -- terraform apply
cloudhop exec acme-prod -- python deploy.py
cloudhop exec acme-prod --region eu-west-1 -- cdk deploy
```

El comando recibe `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`, `AWS_REGION` y `AWS_DEFAULT_REGION`. Úsalo con
herramientas que no leen perfiles, o cuando quieras asegurar el inicio de
sesión antes de una ejecución larga.

:::note
Las credenciales solo viven en el entorno de ese comando. cloudhop nunca las
escribe en disco.
:::

## ¿Cuál debo usar?

| Situación | Usa |
| --- | --- |
| Trabajo interactivo con el AWS CLI | `hop acme-prod ...` |
| Herramientas que admiten perfiles (Terraform, SDKs, IDEs) | `AWS_PROFILE=acme-prod` o la opción de perfil de la herramienta |
| Herramientas que solo leen variables de entorno | `cloudhop exec acme-prod -- ...` |
| Un proceso largo que no debe fallar por una sesión vencida | `cloudhop exec acme-prod -- ...` |
