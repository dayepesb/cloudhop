---
title: Cuentas personales
description: Usa tu propia cuenta de AWS sin access keys ni IAM Identity Center.
---

Para una cuenta de AWS propia, cloudhop usa `aws login`: inicias sesión con
el mismo usuario que usas en la consola de AWS y el CLI recibe credenciales
temporales.

- No hay access keys que crear, copiar o rotar.
- No hay que configurar IAM Identity Center.
- Las credenciales se renuevan solas durante hasta 12 horas; después de eso,
  el navegador se abre otra vez la próxima vez que uses el alias.

## Requisitos

- **AWS CLI 2.32.0 o más reciente.** `cloudhop doctor` lo verifica y te
  ofrece actualizarlo.
- **Usuario root:** nada más.
- **Usuario IAM:** la política administrada `SignInLocalDevelopmentAccess`, o
  las acciones `signin:AuthorizeOAuth2Access` y `signin:CreateOAuth2Token`.
  Los usuarios con `AdministratorAccess` ya las tienen.

## Agrégala

```bash
cloudhop add
```

1. Elige **Personal account (aws login)**.
2. Elige una región predeterminada.
3. Dale un nombre corto, como `personal`.

Se abre el navegador para que inicies sesión en la consola. Luego elige el
nombre del alias (cloudhop sugiere el nombre de la fuente):

```bash
hop personal                 # ¿quién soy?
hop personal s3 ls
```

Si tienes varias cuentas personales, agrega una fuente por cada una.

## En qué se diferencia de un portal SSO

| | Portal SSO | Cuenta personal |
| --- | --- | --- |
| Inicias sesión con | La identidad de tu empresa | Tu usuario de la consola (root o IAM) |
| Cuentas por fuente | Muchas, descubiertas automáticamente | Una |
| Renovación | Refresh token, definida por tu empresa | Hasta 12 horas |
| Perfil de AWS para otras herramientas | Uno por alias, con el mismo nombre | `cloudhop-<source name>`, compartido por sus alias |

:::caution[¿Dejando atrás las access keys?]
Si usabas access keys en `~/.aws/credentials` para esta cuenta, agrégala a
cloudhop, verifica que `hop personal` funcione y luego borra esas keys en la
consola de IAM.
:::
