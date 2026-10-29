---
title: Troubleshooting
description: Common problems and how to fix them.
---

Start with:

```bash
cloudhop doctor          # is the AWS CLI installed and recent enough?
cloudhop ls              # which sources and aliases exist, and their session state
```

Add `CLOUDHOP_DEBUG=1` before any command to see full error details.

## "Invalid start url provided"

AWS doesn't recognise the portal URL. Copy it from your browser while on the
portal's account list; it looks like `https://<your-company>.awsapps.com/start`.
Nothing was saved, so just run `cloudhop add` again.

## The browser doesn't open, or the sign-in never finishes

- Copy the URL cloudhop prints and open it yourself.
- On a remote machine (SSH, container), the browser can't reach cloudhop. Use
  the device code instead: `cloudhop login <source> --device-code`.

## "The AWS CLI is not installed" or "too old"

Run `cloudhop doctor`: it offers to install or update it (Homebrew on macOS,
winget on Windows) or links to the installer. Personal accounts need AWS CLI
2.32.0 or newer.

## "… already defines [profile x] outside cloudhop"

`~/.aws/config` already has a hand-written profile with that name. Pick
another alias name, or delete or rename your profile first. cloudhop never
overwrites profiles it didn't create.

## An alias says "no longer available"

You lost access to that account or role, or it was renamed. Run
`cloudhop sync <source>` to refresh the list, then `cloudhop rm <alias>` and
create a new alias if needed.

## A command keeps asking me to sign in

- Your company may have revoked the session or shortened its duration.
  Sign in once more with `cloudhop login <source>`.
- Check that no `AWS_PROFILE` or credential variables in your shell point
  elsewhere when you use other tools. `hop` ignores them, other tools don't.

## A personal account fails to sign in

- AWS CLI must be 2.32.0 or newer (`cloudhop doctor`).
- An IAM user needs the `SignInLocalDevelopmentAccess` policy; root users
  need nothing extra.

## `cloudhop setup` says it isn't an interactive terminal

You ran it from a script, a pipe or an editor's task runner. Run it in a
regular terminal, or use the flags described in
[Scripts and automation](/cloudhop/guides/scripting/).

## The web page says "cloudhop ui is not responding"

The server was paused (often with <kbd>Ctrl</kbd>+<kbd>Z</kbd>). Run `fg` in
that terminal, or stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd> and run
`cloudhop ui` again.

## My AI assistant doesn't use cloudhop

- Start a **new chat** (or restart the assistant): skills and MCP servers load
  when a chat starts.
- Run `cloudhop agent` to see where the skill is installed. A skill installed
  *for this project* only works in that project.
- Ask it directly, for example "use cloudhop to list my aliases", the first
  time.

## The cloudhop MCP server doesn't start in my editor

Editors opened from the Dock or Start menu sometimes can't find `cloudhop`
(common with Node version managers). Run `which cloudhop` (`where cloudhop` on
Windows) and use that full path as the server's command in the assistant's MCP
settings. Check it with `cloudhop agent`, and in Claude Code with
`claude mcp list`.

## Still stuck?

[Open an issue](https://github.com/dayepesb/cloudhop/issues/new/choose) with
the output of the failing command (remove account ids and URLs first).
