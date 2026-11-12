---
title: Usa un emulador local
description: Dale un alias a AWS Emulator o LocalStack, cambia a él y escribe aws normal, corre tus pruebas contra él o deja un proyecto en él con .cloudhoprc. Nunca llega a AWS.
---

Emuladores como [AWS Emulator](https://github.com/aws/aws-emulator) y
[LocalStack](https://www.localstack.cloud/) sirven las APIs de los servicios
de AWS en tu máquina. cloudhop le da al emulador un alias como a cualquier
cuenta, así que trabajas con él de la misma forma:

```text
❯ cloudhop use local
[ aws local (us-east-1) ]
❯ aws s3 mb s3://test            ← va al emulador, nunca a AWS
❯ aws dynamodb list-tables
❯ cloudhop use acme-dev          ← y de vuelta a una cuenta real
```

`local` es un nombre de ejemplo; lo eliges cuando agregas el emulador.

## Agrega el emulador

Arranca el emulador como dice su documentación y luego:

```bash
cloudhop add
```

Elige **AWS Emulator (local)** o **LocalStack or another local emulator**,
acepta los valores por defecto (o cambia el puerto o el endpoint) y ponle
nombre al alias. No hay que iniciar sesión. En una línea:

```bash
cloudhop add aws aws-emulator --name local                 # https://127.0.0.1:9297
cloudhop add aws localstack --name localstack              # http://localhost:4566
cloudhop add aws localstack --endpoint http://localhost:4567 --name otro
```

También puedes agregarlo desde [`cloudhop ui`](/cloudhop/es/guides/web-ui/).
¿Corres un emulador por puerto, por ejemplo uno por región? Agrega cada uno
con su puerto y su alias.

## Trabaja con él

Todo lo que haces con una cuenta funciona con el emulador:

```bash
hop local s3 ls                        # un comando
cloudhop use local                     # esta terminal, y luego aws normal
cloudhop exec local -- npm test        # tus pruebas, con cualquier SDK
cloudhop use local --save              # este proyecto siempre usa el emulador
hop local                              # ¿quién soy? cuenta 000000000000
```

Tu prompt muestra `aws local` como cualquier alias. Un `.cloudhoprc` con
`aws: local` sirve para un proyecto cuyas pruebas corren contra el emulador.

## Qué configura cloudhop

El alias es un perfil en `~/.aws/config`, así que el AWS CLI, los SDKs y
Terraform también lo encuentran:

```ini
[profile local]
region = us-east-1
endpoint_url = https://127.0.0.1:9297
ca_bundle = /Users/tu/.aws/emulator/9297/ca.pem
credential_process = cloudhop credentials local
```

- **Endpoint.** Todas las peticiones van al emulador.
- **Llaves.** AWS Emulator crea llaves nuevas cada vez que arranca. Con
  `credential_process` el AWS CLI le pide a cloudhop las actuales en cada
  comando, así que un reinicio no te pide nada y las llaves nunca quedan
  escritas en tu configuración. LocalStack acepta las llaves de mentira
  `test` / `test`, que quedan escritas en el perfil.
- **Certificado.** AWS Emulator sirve HTTPS con un certificado que cambia
  en cada arranque, en el mismo archivo. El perfil apunta a ese archivo, y
  `cloudhop exec` también se lo pasa a Node.js (`NODE_EXTRA_CA_CERTS`,
  cuando no has puesto el tuyo). Nunca se desactiva TLS.

## Cuando el emulador no está corriendo

cloudhop revisa antes de cada comando y te dice cómo arrancarlo:

```text
❯ hop local s3 ls
✖ The emulator of local isn't running.
  Start AWS Emulator on port 9297 (`aws-emulator -p 9297` on Linux, its
  Docker container on macOS and Windows), then try again.
```

`cloudhop ls` muestra **emulator running** o **emulator not running** para
cada uno. cloudhop nunca arranca ni detiene el emulador por ti.

## Separado de AWS

- Un alias de emulador **nunca llega a AWS**: su endpoint es tu máquina, y
  un endpoint en `amazonaws.com` se rechaza al agregarlo.
- Al cambiar a él, cloudhop borra las llaves de AWS que hayan quedado en la
  terminal, y `cloudhop exec` desactiva la búsqueda de credenciales de una
  máquina en la nube.
- **No se puede marcar como producción** y **no tiene consola web**:
  `cloudhop console local` te lo dice.
- Todos los emuladores responden como la cuenta `000000000000`. Si
  `hop local` muestra otra cuenta, algo más puso un endpoint: revisa
  `AWS_ENDPOINT_URL` en tu terminal.

Una operación que responde `NotImplemented` todavía no la cubre el
emulador; eso depende del emulador, no de cloudhop.
