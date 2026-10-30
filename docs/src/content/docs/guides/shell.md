---
title: Use an alias in your terminal
description: Switch a terminal to an alias, pin aliases to project folders with .cloudhoprc, keep typing `aws`, and see the alias in your prompt.
---

The everyday way to work: switch the terminal to an alias and keep typing
the plain `aws` commands you know.
`cloudhop use` is your switch between AWS accounts:

```text
❯ cloudhop use license-qa
cloudhop › This shell now uses license-qa (license-account / Dev, us-east-1).

[ aws license-qa (us-east-1) ]                ← your prompt shows it
❯ aws ecs list-clusters                       ← plain aws, as license-qa
❯ aws ecs list-tasks --cluster api --launch-type FARGATE
❯ terraform plan                              ← and every other tool
```

`license-qa` and the other names here are example aliases; use yours.
`hop`, `each` and `console` keep working as always: an alias you name in a
command wins for that command and doesn't change the terminal.

## Do I need to set anything up?

**For `hop`, `each`, `console`, `exec` and the web page: no.** They work right
after `npm install`.

**To switch the terminal you are typing in: one line in your shell's startup
file.** A program can't change the environment of the terminal that started
it; only the shell itself can. That's why it takes one line. Run this once (`cloudhop setup` offers it too):

```bash
cloudhop shell
```

It asks, adds one line to `~/.zshrc`, `~/.bashrc`, fish's `config.fish` or
your PowerShell profile, and you open a new terminal. To add it by hand:

| Shell | Line |
| --- | --- |
| zsh (after `compinit`) | `eval "$(cloudhop shell zsh)"` |
| bash | `eval "$(cloudhop shell bash)"` |
| fish | `cloudhop shell fish \| source` |
| PowerShell | `cloudhop shell pwsh \| Out-String \| Invoke-Expression` |

**Without it**, `cloudhop use <alias>` still works: it opens a new shell that
uses the alias. Type `exit` to go back.

## Switch a terminal: `cloudhop use`

```bash
cloudhop use license-qa     # or just `cloudhop use` to pick from a list
cloudhop use --off          # stop using any alias
cloudhop use --off aws      # stop using just the AWS one
```

What cloudhop does:

1. Signs you in if the session expired (the browser opens only then).
2. Sets the alias' profile and region in **this terminal only**
   (`AWS_PROFILE`, `AWS_REGION`, `AWS_DEFAULT_REGION`) and clears any access
   keys left there. Other terminals don't change.
3. Remembers which alias each cloud uses (`CLOUDHOP_AWS_ALIAS`), so your
   prompt can show it and, when Azure and Google Cloud arrive, an alias of
   each can be active side by side.

## Keep typing `aws`

With the integration, `aws` in your terminal goes through cloudhop while an
alias is in use. Typing `aws s3 ls` is the same as `hop license-qa s3 ls`:

- **Expired session?** Your browser opens, you approve, and the command
  carries on. No `aws sso login`, no copied credentials.
- **Production alias?** Reads run right away; anything that may change
  resources asks first. See [Production protection](/cloudhop/guides/production/).
- `aws ... --profile other` and `command aws ...` run the AWS CLI directly,
  as always. With no alias in use, `aws` is just `aws`.

How: the integration defines a shell function named `aws`. Shell functions
win over programs on your `PATH`, and inside it `command aws` calls the real
one. The AWS CLI itself isn't touched. Turn it off with `CLOUDHOP_WRAP=0`.

:::caution
Scripts, Makefiles and tools such as Terraform call the AWS CLI or SDK
directly, not your shell function. They do run as the alias (they read
`AWS_PROFILE`), but without the automatic sign-in and without production
checks. For those, use `cloudhop exec <alias> -- <command>`.
:::

## Pin an alias to a folder: `.cloudhoprc`

Put a `.cloudhoprc` in a project and the terminal switches to
its alias when you `cd` into the project (or any folder inside it), and back
when you leave.

**Set up a project once:**

```bash
cd ~/repos/license-api
cloudhop use license-qa --save    # writes .cloudhoprc and trusts it for you
git add .cloudhoprc               # optional: share it with your team
```

The file is plain text, one line per cloud:

```text
# cloudhop: aliases for this folder
aws: license-qa
```

**From then on, just `cd` and type `aws`:**

```text
❯ cd ~/repos/license-api
cloudhop › Using license-qa (license-account / Dev, us-east-1), from .cloudhoprc.
[ aws license-qa (us-east-1) ]
❯ aws ecs list-tasks --cluster api
❯ cd ~/repos/billing                     ← another project, another account
cloudhop › Using billing-dev (billing-account / Dev, us-east-1), from .cloudhoprc.
❯ cd ~
cloudhop › Left the folder of billing-dev: no alias in this shell.
```

**A teammate who clones the repository** runs `cloudhop allow` once in it.
Their alias must have the same name: share names with
[`cloudhop team export`](/cloudhop/guides/team/).

**You approve each file first.** A `.cloudhoprc` you didn't write (say, in a
repository you just cloned) does nothing until you run `cloudhop allow` in
that folder, and any later change to the file needs a new `cloudhop allow`.
`cloudhop deny` withdraws it. A `.cloudhoprc` can only name aliases you
already have: it never adds portals, signs you in or touches credentials,
and entering a folder never opens your browser.

A `cloudhop use` you type yourself wins until you leave the folder. Turn the
automatic switch off with `CLOUDHOP_AUTO_USE=0`.

## See the alias in your prompt

**It shows up by itself** once you run `cloudhop shell`, in a new terminal:

- **Starship**: `cloudhop shell` adds an `aws license-qa (us-east-1)`
  segment to your `~/.config/starship.toml` that looks like the rest of your
  prompt: in a powerline theme it joins the chain with your own arrows and
  colors; otherwise it is colored text like Starship's own modules.
  Production aliases show in red with `PROD`. A backup stays in
  `starship.toml.cloudhop-backup`. Already had the shell line? Run
  `cloudhop shell` again: it adds what is missing.
- **zsh**: at the right of the prompt (`aws:license-qa`).
- **bash** (Git Bash on Windows too) **and PowerShell** (Windows Terminal or
  the Windows console): before the prompt, `[aws:license-qa] PS C:\repo>`.
- **fish**: at the right, unless you have your own `fish_right_prompt`.
- **cmd.exe** has no integration: `cloudhop use` opens a new `cmd` whose
  prompt starts with `[aws:license-qa]`.

The label is sky blue, and red with `PROD` for production aliases.

**Where am I?** In any terminal, `cloudhop status` starts with the alias
this terminal uses:

```text
❯ cloudhop status
This terminal uses aws license-qa (us-east-1).
```

Don't want it? `CLOUDHOP_PROMPT=0` turns off the built-in label; for
Starship, delete the `# >>> cloudhop >>>` block and the
`${env_var.cloudhop_*}` segments in `format`. `cloudhop shell starship`
prints the Starship snippet if you prefer to place it yourself.

Building your own? These variables are set while an alias is in use:

| Variable | Example |
| --- | --- |
| `CLOUDHOP_AWS_ALIAS` | `license-qa` |
| `CLOUDHOP_AWS_PROMPT` | `license-qa (us-east-1)` |
| `CLOUDHOP_AWS_PROD` | `1` for production aliases, unset otherwise |
| `CLOUDHOP_AWS_SEGMENT` / `CLOUDHOP_AWS_PROD_SEGMENT` | Like `CLOUDHOP_AWS_PROMPT`, but only one is set: the second for production, so a theme can color it apart |

## Pick from a list and tab completion

You don't have to remember alias names:

```bash
hop               # pick the alias, then type the command (empty = who am I)
hop - s3 ls       # pick the alias, then run `aws s3 ls`
cloudhop use      # pick the alias for this terminal
cloudhop console  # pick the alias and open its console
```

Type words in any order to filter: `license q` finds `license-qa`. With the
integration, <kbd>Tab</kbd> also completes alias names after `hop`, the
`cloudhop` commands, and aliases or portals after the commands that take
them.

## Options at a glance

| Variable | Effect |
| --- | --- |
| `CLOUDHOP_WRAP=0` | `aws` stays the plain AWS CLI even with an alias in use |
| `CLOUDHOP_AUTO_USE=0` | `cd` doesn't read `.cloudhoprc` files |
| `CLOUDHOP_PROMPT=0` | No built-in alias label in the prompt (Starship is configured apart) |
