---
title: Solución de problemas
description: Problemas comunes y cómo resolverlos.
---

Empieza con:

```bash
cloudhop doctor          # ¿el AWS CLI está instalado y es lo bastante reciente?
cloudhop ls              # qué fuentes y alias existen, y el estado de su sesión
```

Agrega `CLOUDHOP_DEBUG=1` antes de cualquier comando para ver los detalles
completos del error.

## "Invalid start url provided"

AWS no reconoce la URL del portal. Cópiala de tu navegador mientras estás en
la lista de cuentas del portal; se ve así:
`https://<your-company>.awsapps.com/start`. No se guardó nada, así que solo
ejecuta `cloudhop add` otra vez.

## El navegador no se abre, o el inicio de sesión nunca termina

- Copia la URL que imprime cloudhop y ábrela tú mismo.
- En una máquina remota (SSH, contenedor), el navegador no puede llegar a
  cloudhop. Usa el código de dispositivo:
  `cloudhop login <source> --device-code`.

## "The AWS CLI is not installed" o "too old"

Ejecuta `cloudhop doctor`: te ofrece instalarlo o actualizarlo (Homebrew en
macOS, winget en Windows) o te enlaza al instalador. Las cuentas personales
necesitan AWS CLI 2.32.0 o más reciente.

## "… already defines [profile x] outside cloudhop"

`~/.aws/config` ya tiene un perfil escrito a mano con ese nombre. Elige otro
nombre para el alias, o borra o cambia el nombre de tu perfil primero.
cloudhop nunca sobrescribe perfiles que no creó.

## Un alias dice "no longer available"

Perdiste el acceso a esa cuenta o rol, o le cambiaron el nombre. Ejecuta
`cloudhop sync <source>` para actualizar la lista, luego `cloudhop rm <alias>`
y crea un alias nuevo si hace falta.

## Un comando me sigue pidiendo iniciar sesión

- Puede que tu empresa haya revocado la sesión o acortado su duración.
  Inicia sesión una vez más con `cloudhop login <source>`.
- Verifica que no haya un `AWS_PROFILE` ni variables de credenciales en tu
  shell que apunten a otro lado cuando usas otras herramientas. `hop` las
  ignora; las otras herramientas no.

## Una cuenta personal no logra iniciar sesión

- El AWS CLI debe ser 2.32.0 o más reciente (`cloudhop doctor`).
- Un usuario IAM necesita la política `SignInLocalDevelopmentAccess`; los
  usuarios root no necesitan nada más.

## `cloudhop setup` dice que no es una terminal interactiva

Lo ejecutaste desde un script, un pipe o el ejecutor de tareas de un editor.
Ejecútalo en una terminal normal, o usa los flags descritos en
[Scripts y automatización](/cloudhop/es/guides/scripting/).

## La página web dice "cloudhop ui is not responding"

El servidor se pausó (muchas veces con <kbd>Ctrl</kbd>+<kbd>Z</kbd>). Ejecuta
`fg` en esa terminal, o detenlo con <kbd>Ctrl</kbd>+<kbd>C</kbd> y vuelve a
ejecutar `cloudhop ui`.

## "… is production and … may change resources"

El alias está marcado como de producción y el comando no es de solo lectura.
En una terminal, cloudhop te pregunta; en scripts y asistentes de IA, se
niega. Si una persona aprobó ese comando exacto, ejecútalo con
`CLOUDHOP_CONFIRM_PROD=1`. Consulta
[Protege producción](/cloudhop/es/guides/production/).

## `cloudhop use` dice que necesita la integración con la shell

Ejecuta `cloudhop shell` y abre una terminal nueva. Consulta
[Usa un alias en tu terminal](/cloudhop/es/guides/shell/).

## La consola se abre a través del portal, o en la página de inicio de sesión

AWS no aceptó un inicio de sesión directo para ese rol o cuenta, así que
cloudhop usó en su lugar el enlace del portal de acceso (SSO) o la página de
inicio de sesión de la consola (cuentas personales). Todo lo demás funciona
igual.

## Mi asistente de IA no usa cloudhop

- Abre un **chat nuevo** (o reinicia el asistente): las skills y los
  servidores MCP se cargan al iniciar un chat.
- Ejecuta `cloudhop agent` para ver dónde está instalada la skill. Una skill
  instalada *para este proyecto* solo funciona en ese proyecto.
- La primera vez pídeselo directo, por ejemplo "usa cloudhop para listar mis
  alias".

## El servidor MCP de cloudhop no arranca en mi editor

Los editores abiertos desde el Dock o el menú Inicio a veces no encuentran
`cloudhop` (pasa mucho con gestores de versiones de Node). Ejecuta
`which cloudhop` (`where cloudhop` en Windows) y usa esa ruta completa como
comando del servidor en la configuración MCP del asistente. Revísalo con
`cloudhop agent` y, en Claude Code, con `claude mcp list`.

## ¿Sigues atascado?

[Abre un issue](https://github.com/dayepesb/cloudhop/issues/new/choose) con
la salida del comando que falla (quita antes los ids de cuenta y las URLs).
