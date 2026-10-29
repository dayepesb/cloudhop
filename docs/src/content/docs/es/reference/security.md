---
title: Seguridad
description: Cómo cloudhop protege tu acceso a la nube y cómo reportar un problema.
---

cloudhop está entre tú y tus cuentas en la nube, así que está diseñado para
guardar lo menos posible.

## Sin secretos de larga duración

- **Sin access keys.** Los portales de empresa usan IAM Identity Center; las
  cuentas personales usan `aws login`. Ambos dan credenciales temporales.
- **Los tokens se quedan donde los guarda el AWS CLI** (`~/.aws/sso/cache`),
  y solo los puede leer tu usuario. La configuración propia de cloudhop no
  contiene secretos.
- **Las credenciales de `cloudhop exec`** viven solo en el entorno de ese
  comando; nunca se escriben en disco.
- **Las keys heredadas se ignoran.** `hop` descarta `AWS_ACCESS_KEY_ID` y
  similares de tu shell, para que una key vieja no tenga prioridad sobre el
  alias sin que te des cuenta.

## Inicio de sesión

cloudhop usa los mismos flujos de OAuth que el AWS CLI: authorization code
con PKCE y una redirección del navegador a `127.0.0.1`, o un código de
dispositivo con `--device-code`. Tu contraseña y tu MFA solo van a las
páginas de AWS.

## La interfaz web local

`cloudhop ui` expone las mismas acciones que el CLI, así que está restringida
a la persona que está frente al teclado:

- Solo escucha en `127.0.0.1`.
- Cada solicitud necesita una clave aleatoria creada para esa ejecución. Viaja
  en el `#fragment` del enlace, así que nunca se envía en la línea de la
  solicitud ni en el `Referer`.
- Se rechazan las solicitudes cuyo `Host` u `Origin` no es la dirección
  local, lo que bloquea a otros sitios web y los ataques de DNS rebinding.
- Una Content-Security-Policy estricta solo permite el script propio de la
  página.
- La página recibe lo que muestra `cloudhop ls`, nunca tokens ni
  credenciales.

## Cómo se publican las versiones

- Cada cambio pasa por CodeQL, una auditoría de dependencias y un escaneo de
  secretos, además de pruebas en Linux, macOS y Windows.
- Las versiones las compila y publica GitHub Actions, solo después de que un
  mantenedor las aprueba, usando npm trusted publishing: no existe ningún
  token de npm que se pueda robar.
- Cada versión incluye npm provenance. Verifica lo que instalaste con:

  ```bash
  npm audit signatures
  ```

## Reporta una vulnerabilidad

Repórtala de forma privada en GitHub:
[Report a vulnerability](https://github.com/dayepesb/cloudhop/security/advisories/new).
No abras un issue público. Consulta la
[política de seguridad](https://github.com/dayepesb/cloudhop/blob/main/SECURITY.md).
