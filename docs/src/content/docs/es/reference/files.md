---
title: Configuración y archivos
description: Qué guarda cloudhop, dónde lo guarda y qué nunca toca.
---

cloudhop guarda su propia configuración en una carpeta y escribe archivos
estándar de AWS en el formato que el AWS CLI ya usa. Nunca escribe
`~/.aws/credentials`.

| Archivo | Lo escribe | Contiene | ¿Secretos? |
| --- | --- | --- | --- |
| `~/.config/cloudhop/config.yaml` | cloudhop | Nubes activadas, fuentes y alias | No |
| `~/.config/cloudhop/targets.json` | cloudhop | Caché de las cuentas y roles de cada fuente | No |
| `~/.config/cloudhop/assistants.json` | `cloudhop agent` | Qué skills de asistentes instaló cloudhop, para mantenerlas al día | No |
| `~/.config/cloudhop/update-check.json` | cloudhop | Cuándo se revisó npm por última vez y la última versión | No |
| `~/.config/cloudhop/trusted-folders.json` | `cloudhop allow`, `use --save` | Los `.cloudhoprc` en los que confiaste, con una huella de su contenido | No |
| `~/.config/starship.toml` | `cloudhop shell`, solo si usas Starship | Un bloque marcado `# >>> cloudhop >>>` y los segmentos del alias en `format` (copia: `starship.toml.cloudhop-backup`) | No |
| `.cloudhoprc` en un proyecto | `cloudhop use --save`, o tú | El alias que usa cada nube en esa carpeta, como `aws: license-qa` | No |
| Skills y configuración MCP de los asistentes | `cloudhop agent install` | Todas las rutas en [Asistentes de IA](/cloudhop/es/guides/ai-assistants/) | No |
| `~/.aws/config` | cloudhop, solo dentro de su bloque | Un `sso-session` por portal, un perfil por alias | No |
| `~/.aws/sso/cache/<hash>.json` | cloudhop, como `aws sso login` | La sesión SSO: access token y refresh token, vencimiento | Tokens de corta duración, no access keys |
| `~/.aws/credentials` | nunca | Nada de cloudhop | |

Los archivos que crea cloudhop solo los puede leer tu usuario (`0600`).

## `config.yaml`

Puedes leerlo, pero modifícalo con los comandos de cloudhop:

```yaml
# cloudhop configuration. Contains no secrets.
providers:
  - aws
sources:
  acme:
    provider: aws
    kind: sso
    settings:
      startUrl: https://acme.awsapps.com/start
      region: us-east-1
aliases:
  acme-prod:
    source: acme
    target: 123456789012/AdministratorAccess
  acme-dev:
    source: acme
    target: 210987654321/Developer
    region: us-east-2      # solo cuando es distinta de la región de la fuente
    default: true          # las terminales nuevas arrancan con él (`cloudhop use --default`)
```

Cambia la ubicación de la carpeta con `CLOUDHOP_HOME`, o con
`XDG_CONFIG_HOME` si lo usas.

## `.cloudhoprc`

Un archivo de carpeta: con la integración con la shell, hacer
`cd` a la carpeta (o a cualquier carpeta dentro de ella) cambia la terminal a
estos alias.

```text
# cloudhop: aliases for this folder
aws: license-qa
```

Una línea `nube: alias` por nube, o solo el nombre de un alias. Un archivo no
hace nada hasta que confías en él con `cloudhop allow`; editarlo pide un
nuevo `cloudhop allow`. Consulta [Usa un alias en tu terminal](/cloudhop/es/guides/shell/#fija-un-alias-a-una-carpeta-cloudhoprc).

## El bloque en `~/.aws/config`

cloudhop escribe entre dos marcadores y deja todo lo demás intacto, así que
tus perfiles escritos a mano se quedan como están:

```ini
[default]
region = us-east-1

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

Si creas un alias cuyo nombre ya existe como perfil escrito a mano, cloudhop
se detiene y te avisa en lugar de sobrescribirlo.

## La caché de tokens de SSO

La sesión se guarda en `~/.aws/sso/cache/`, en el mismo formato y lugar que
`aws sso login`. Por eso el AWS CLI, Terraform y los SDKs reutilizan la
sesión que abrió cloudhop sin pedirte que vuelvas a iniciar sesión.

## Desinstalar

```bash
cloudhop rm <every source> --yes   # elimina los alias y sus perfiles
npm uninstall --global cloudhop
rm -rf ~/.config/cloudhop
```

O borra a mano el bloque `cloudhop managed` de `~/.aws/config`: tu archivo
queda exactamente como estaba antes de cloudhop.
