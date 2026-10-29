---
title: Abre la consola de AWS
description: Abre la consola web como un alias, con la sesión ya iniciada, sin pasar por el portal de acceso.
---

```bash
cloudhop console acme-prod             # el inicio de la consola, con sesión de acme-prod
cloudhop console acme-prod s3          # directo a S3
cloudhop console acme-prod lambda --region eu-west-1
cloudhop console                       # elige el alias de una lista
```

Tu navegador abre la consola de AWS **con la sesión ya iniciada** en esa
cuenta y ese rol, en la región del alias. Sin portal de acceso, sin buscar la
cuenta entre decenas, sin hacer clic en "Management console".

El botón **Console** junto a cada alias en
[`cloudhop ui`](/cloudhop/es/guides/web-ui/) hace lo mismo.

## Cómo funciona

cloudhop usa la sesión que ya tiene para obtener credenciales de corta
duración para el alias y las intercambia con el servicio de inicio de sesión
de AWS (el flujo documentado de "custom identity broker") por un enlace de
inicio de sesión de un solo uso. Luego abre ese enlace en tu navegador.

- Si la sesión venció, cloudhop primero inicia sesión, como siempre.
- El enlace de inicio de sesión es secreto durante 15 minutos: cloudhop lo
  abre y **nunca lo imprime ni lo registra**. Las credenciales se envían a
  AWS en el cuerpo de la solicitud, nunca en una URL.
- La sesión de la consola dura lo mismo que la sesión de tu rol (la definen
  tus administradores en IAM Identity Center).

Si AWS no acepta un inicio de sesión directo para ese rol, cloudhop abre la
misma cuenta y el mismo rol **a través de tu portal de acceso** (con su enlace
de acceso directo oficial), y te lo avisa.

## Nombres de servicio

El segundo argumento es la parte de la URL de la consola que corresponde al
servicio: `s3`, `ec2`, `lambda`, `cloudwatch`, `iam`, `dynamodb`,
`cloudformation`, `rds`... Si un servicio abre su página de inicio con otro
nombre, usa ese nombre.

## Cuentas personales

Para las cuentas agregadas con `aws login`, cloudhop intenta el mismo inicio
de sesión directo. Si AWS no lo permite para ese tipo de sesión, se abre la
página de inicio de sesión de la consola y entras como siempre.

## Varias cuentas a la vez

AWS permite que tu navegador mantenga varias sesiones de la consola a la vez
si activas **multi-session** en el menú de cuenta de la consola. Si no, iniciar
sesión con un segundo alias reemplaza al primero en ese navegador.
