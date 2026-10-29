---
title: Shell integration
description: Pick aliases from a list, use an alias in your shell without hop, tab-complete aliases and show the alias in your prompt.
---

## Pick from a list

You don't have to remember alias names:

```bash
hop               # pick the alias, then type the command (empty = who am I)
hop - s3 ls       # pick the alias, then run `aws s3 ls`
cloudhop console  # pick the alias and open its console
```

Type any words in any order to filter: `creci q` finds `creci-qa`. It
searches the alias, the account and role, the region and the portal.
Production aliases are marked **PROD**.

## Set it up once

The rest needs a few lines in your shell:

```bash
cloudhop shell install
```

It adds one line to your shell's startup file (`~/.zshrc`, `~/.bashrc`,
fish's `config.fish` or your PowerShell profile) after asking. Open a new
terminal afterwards. To do it by hand, add:

| Shell | Line |
| --- | --- |
| zsh (after `compinit`) | `eval "$(cloudhop shell zsh)"` |
| bash | `eval "$(cloudhop shell bash)"` |
| fish | `cloudhop shell fish \| source` |
| PowerShell | `cloudhop shell pwsh \| Out-String \| Invoke-Expression` |

## Use an alias in this shell

```bash
cloudhop use creci-qa      # or just `cloudhop use` to pick it
aws s3 ls                  # plain aws, as creci-qa
terraform plan             # Terraform too
cloudhop use --off         # back to normal
```

`cloudhop use` signs you in if needed and sets `AWS_PROFILE`, `AWS_REGION`
and `AWS_DEFAULT_REGION` in your current shell (and clears any access keys
there). Other terminals aren't affected.

:::caution
Plain `aws` commands don't go through cloudhop, so production protection
doesn't apply to them. Use `hop <alias>` for production work.
:::

## Tab completion

After setting it up, <kbd>Tab</kbd> completes alias names after `hop`, the
`cloudhop` commands, aliases after `cloudhop use`, `console`, `status`,
`region`, `mv`, `prod`, `rm` and `exec`, and portals after `cloudhop alias`,
`login`, `sync` and `ls`.

## Show the alias in your prompt

The integration defines `cloudhop_prompt`, which prints `☁ creci-qa` (and
`PROD` for production) while an alias is in use. Add it to your prompt:

```bash
# zsh (~/.zshrc)
setopt prompt_subst
RPROMPT='$(cloudhop_prompt)'

# bash (~/.bashrc)
PS1='$(cloudhop_prompt) '"$PS1"
```

With [Starship](https://starship.rs), add a custom module instead:

```toml
[custom.cloudhop]
command = 'printf "%s%s" "$CLOUDHOP_ALIAS" "${CLOUDHOP_PROD:+ PROD}"'
when = '[ -n "$CLOUDHOP_ALIAS" ]'
symbol = '☁ '
style = 'bold #3bb8f5'
```
