---
title: Cómo funciona
description: Fuentes, destinos, alias y sesiones, y qué pasa cuando ejecutas hop.
---

cloudhop es una capa delgada delante del AWS CLI. Nunca lo reemplaza: elige
el perfil y la región correctos, se asegura de que hayas iniciado sesión y
se quita del camino.

## Cuatro ideas

| Idea | Qué es | Ejemplo |
| --- | --- | --- |
| **Fuente** | Un lugar donde inicias sesión una vez | El portal SSO `https://acme.awsapps.com/start`, o tu cuenta personal |
| **Destino** | Una cuenta y un rol que puedes usar desde una fuente | `123456789012` / `AdministratorAccess` |
| **Alias** | Tu nombre corto para un destino más una región | `acme-prod` → acme / 123456789012 / AdministratorAccess / us-east-1 |
| **Sesión** | El inicio de sesión de una fuente, compartido por todos sus alias | Válida, renovable o vencida |

Un destino siempre es la combinación de **cuenta y rol**: la misma cuenta con
dos roles distintos son dos destinos. Una fuente tiene muchos destinos; tú
eliges cuáles se convierten en alias. Todos los alias de una fuente comparten
una sesión, así que con iniciar sesión una vez quedan cubiertos todos.

## Qué pasa cuando ejecutas `hop acme-prod s3 ls`

```text
hop acme-prod s3 ls
 │
 ├─ 1. Busca el alias      acme-prod → fuente "acme", cuenta 123456789012,
 │                         rol AdministratorAccess, región us-east-1
 ├─ 2. Revisa la sesión    válida → sigue
 │                         vencida pero renovable → la renueva en silencio
 │                         vencida → abre el navegador, inicia sesión,
 │                                   actualiza las cuentas de "acme"
 └─ 3. Ejecuta el AWS CLI  aws s3 ls
                           con AWS_PROFILE=acme-prod, AWS_REGION=us-east-1
```

Si el AWS CLI aun así reporta una sesión vencida (por ejemplo, porque se
revocó en el servidor), cloudhop vuelve a iniciar sesión y reintenta el
comando una vez.

## Dos tipos de fuentes

### Portales de empresa (IAM Identity Center)

Inicias sesión a través del portal de tu empresa en el navegador. cloudhop
usa el mismo flujo de inicio de sesión que `aws sso login` y le pregunta al
portal qué cuentas y roles tienes. Cuando la sesión vence, la renueva con el
refresh token si es posible, así que casi nunca ves el navegador. Consulta
[Portales SSO de empresa](/cloudhop/es/guides/aws-sso/).

### Cuentas personales (`aws login`)

Para tu propia cuenta de AWS, cloudhop usa `aws login`, que inicia sesión con
tu usuario de la consola y le da al CLI credenciales temporales. No necesitas
access keys ni Identity Center. Consulta
[Cuentas personales](/cloudhop/es/guides/personal-accounts/).

## Dónde se guarda todo

cloudhop mantiene su propia configuración aparte y escribe archivos estándar
de AWS, así que todo sigue funcionando con las herramientas que ya usas:

- `~/.config/cloudhop/config.yaml`: tus fuentes y alias. Sin secretos.
- `~/.aws/config`: un perfil por cada alias de portal de empresa, dentro de un
  bloque que administra cloudhop.
- `~/.aws/sso/cache/`: la sesión SSO, en el mismo formato que usa el AWS CLI.

Más detalles en [Configuración y archivos](/cloudhop/es/reference/files/).

## Más nubes

cloudhop está hecho para que otras nubes se conecten como proveedores. AWS
funciona hoy; Azure y Google Cloud están planeados, en el mismo paquete, y se
activan con `cloudhop provider enable`.
