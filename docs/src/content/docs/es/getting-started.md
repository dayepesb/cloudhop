---
title: Primeros pasos
description: Instala cloudhop y agrega tu primera cuenta en dos minutos.
---

## Instalar

cloudhop necesita Node.js 20 o superior.

```bash
npm i -g cloudhop
```

Esto instala dos comandos: `cloudhop` y su forma corta `hop`.

## Configurar

```bash
cloudhop setup
```

El asistente:

1. Pregunta qué nubes usas (hoy AWS; Azure y Google Cloud vienen en camino).
2. Revisa que tengas AWS CLI v2 y te ofrece instalarlo si falta.
3. Agrega tu primera fuente: un portal SSO de empresa o una cuenta personal.
4. Abre el navegador para que inicies sesión.
5. Lista todas las cuentas y roles a los que tienes acceso para que elijas
   los que quieras y les pongas un alias corto.

## Usar un alias

```bash
hop acme-prod                      # ¿quién soy? (aws sts get-caller-identity)
hop acme-prod s3 ls                # cualquier comando de aws, como acme-prod
hop acme-prod s3 ls --region eu-west-1
```

¿Necesitas credenciales para otra herramienta?

```bash
cloudhop exec acme-prod -- terraform plan
```

## Cuando una sesión vence

No tienes que hacer nada. La próxima vez que uses un alias, cloudhop renueva
la sesión en silencio si puede. Si no, abre el navegador, actualiza todas las
cuentas de ese portal y luego ejecuta tu comando.
