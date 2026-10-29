---
title: Integración con la shell
description: Elige alias de una lista, usa un alias en tu shell sin hop, autocompleta alias con Tab y muestra el alias en tu prompt.
---

## Elige de una lista

No tienes que recordar los nombres de los alias:

```bash
hop               # elige el alias y luego escribe el comando (vacío = quién soy)
hop - s3 ls       # elige el alias y luego ejecuta `aws s3 ls`
cloudhop console  # elige el alias y abre su consola
```

Escribe palabras en cualquier orden para filtrar: `creci q` encuentra
`creci-qa`. Busca en el alias, la cuenta y el rol, la región y el portal. Los
alias de producción aparecen marcados con **PROD**.

## Configúrala una vez

Lo demás necesita unas pocas líneas en tu shell:

```bash
cloudhop shell install
```

Agrega una línea al archivo de inicio de tu shell (`~/.zshrc`, `~/.bashrc`,
el `config.fish` de fish o tu perfil de PowerShell), después de preguntarte.
Luego abre una terminal nueva. Para hacerlo a mano, agrega:

| Shell | Línea |
| --- | --- |
| zsh (después de `compinit`) | `eval "$(cloudhop shell zsh)"` |
| bash | `eval "$(cloudhop shell bash)"` |
| fish | `cloudhop shell fish \| source` |
| PowerShell | `cloudhop shell pwsh \| Out-String \| Invoke-Expression` |

## Usa un alias en esta shell

```bash
cloudhop use creci-qa      # o solo `cloudhop use` para elegirlo
aws s3 ls                  # aws normal, como creci-qa
terraform plan             # Terraform también
cloudhop use --off         # vuelve a la normalidad
```

`cloudhop use` inicia sesión si hace falta y define `AWS_PROFILE`,
`AWS_REGION` y `AWS_DEFAULT_REGION` en tu shell actual (y borra cualquier
access key que haya ahí). Las otras terminales no se ven afectadas.

:::caution
Los comandos `aws` normales no pasan por cloudhop, así que la protección de
producción no se aplica a ellos. Usa `hop <alias>` para trabajar en
producción.
:::

## Autocompletado con Tab

Una vez configurada, <kbd>Tab</kbd> completa los nombres de alias después de
`hop`, los comandos de `cloudhop`, los alias después de `cloudhop use`,
`console`, `status`, `region`, `mv`, `prod`, `rm` y `exec`, y los portales
después de `cloudhop alias`, `login`, `sync` y `ls`.

## Muestra el alias en tu prompt

La integración define `cloudhop_prompt`, que imprime `☁ creci-qa` (y `PROD`
en producción) mientras un alias está en uso. Agrégalo a tu prompt:

```bash
# zsh (~/.zshrc)
setopt prompt_subst
RPROMPT='$(cloudhop_prompt)'

# bash (~/.bashrc)
PS1='$(cloudhop_prompt) '"$PS1"
```

Con [Starship](https://starship.rs), agrega en su lugar un módulo
personalizado:

```toml
[custom.cloudhop]
command = 'printf "%s%s" "$CLOUDHOP_ALIAS" "${CLOUDHOP_PROD:+ PROD}"'
when = '[ -n "$CLOUDHOP_ALIAS" ]'
symbol = '☁ '
style = 'bold #3bb8f5'
```
