---
title: Portales SSO de empresa
description: Usa uno o varios portales de AWS IAM Identity Center con cloudhop.
---

La mayoría de las empresas dan acceso a AWS a través de un portal de
**IAM Identity Center** (antes AWS SSO). Tiene una URL de inicio como
`https://acme.awsapps.com/start`: la página que abres para ver tus cuentas.

## Agrega un portal

```bash
cloudhop add
```

1. Elige **IAM Identity Center (SSO portal)**.
2. Pega la **URL de inicio**. Cópiala del navegador cuando estés en la lista
   de cuentas de tu portal, o pídesela a tus administradores.
3. Escribe la **región de SSO**: la región donde tu empresa configuró
   Identity Center. `us-east-1` es la más común; tus administradores la
   conocen.
4. Dale al portal un **nombre corto** (cloudhop sugiere uno a partir de la
   URL, como `acme`). Lo verás en `cloudhop ls` y lo usarás en comandos como
   `cloudhop login acme`.

Se abre el navegador, inicias sesión y apruebas, y cloudhop lista todas las
cuentas y roles que puedes usar. Elige los que quieras y dale a cada uno un
alias y una región (consulta
[Alias y regiones](/cloudhop/es/guides/aliases-and-regions/)).

:::tip[¿Un error en la URL?]
Si el inicio de sesión falla, no se guarda nada: corrige la URL e inténtalo
de nuevo. cloudhop te avisa cuando AWS no reconoce una URL de inicio.
:::

## Varios portales

Agrega todos los que necesites: ejecuta `cloudhop add` otra vez para cada uno.
Cada portal tiene su propia sesión, así que iniciar sesión en uno no afecta a
los demás.

```bash
cloudhop ls
```

```text
acme  AWS · https://acme.awsapps.com/start
  ● session valid
  ALIAS        REGION     ACCOUNT / ROLE
  acme-prod    us-east-1  acme-production / AdministratorAccess
  acme-dev     us-east-2  acme-development / Developer

globex  AWS · https://globex.awsapps.com/start
  ○ expired, opens the browser on next use
  ALIAS        REGION     ACCOUNT / ROLE
  globex-qa    eu-west-1  globex-qa / ReadOnly
```

## Sesiones y renovación

Cuánto dura una sesión lo define tu empresa en Identity Center (suele ser de
8 a 12 horas). cloudhop la maneja así:

- **Válida**: los comandos se ejecutan de inmediato.
- **Renovable**: la sesión venció, pero se puede renovar sin el navegador;
  cloudhop lo hace en silencio con el siguiente comando.
- **Vencida**: el siguiente comando abre el navegador. Después de que inicias
  sesión, cloudhop actualiza las cuentas y roles de ese portal y ejecuta tu
  comando.

Para iniciar sesión a propósito, por ejemplo antes de quedarte sin conexión:

```bash
cloudhop login acme
```

## Mantén la lista de cuentas al día

Cuando obtienes acceso a una cuenta nueva, aparece después del siguiente
inicio de sesión. Para actualizarla ya:

```bash
cloudhop sync            # todos los portales
cloudhop sync acme       # un portal
```

Si desaparece una cuenta o un rol para el que tenías un alias,
`cloudhop sync` te avisa y `cloudhop ls` marca el alias como no disponible.

## ¿No hay navegador en esta máquina?

En un servidor remoto (por SSH), el navegador no puede llegar a cloudhop. Usa
el flujo de código de dispositivo: cloudhop imprime una URL y un código que
confirmas desde cualquier dispositivo.

```bash
cloudhop login acme --device-code
```

Define `CLOUDHOP_DEVICE_CODE=1` para usarlo siempre en esa máquina.

## Qué escribe cloudhop

Un bloque en `~/.aws/config`, y nada fuera de él:

```ini
# >>> cloudhop managed >>> (edit with `cloudhop`, not by hand)
[sso-session cloudhop-acme]
sso_start_url = https://acme.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile acme-prod]
sso_session = cloudhop-acme
sso_account_id = 123456789012
sso_role_name = AdministratorAccess
region = us-east-1
# <<< cloudhop managed <<<
```

El token de la sesión va donde el AWS CLI lo espera (`~/.aws/sso/cache`), así
que `aws --profile acme-prod ...` también funciona, y lo mismo pasa con
[otras herramientas](/cloudhop/es/guides/other-tools/).

## Elimina un portal

```bash
cloudhop rm acme
```

cloudhop pregunta antes de eliminar un portal, porque sus alias se eliminan
con él.
