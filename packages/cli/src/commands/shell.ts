import { readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  type CloudhopApp,
  CloudhopError,
  PROVIDER_IDS,
  type ProcessEnv,
  type ProviderId,
  RESERVED_NAMES,
} from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { answer, p, paint } from '../ui';
import {
  addToStarshipConfig,
  hasCloudhopStarship,
  STARSHIP_SEGMENTS,
  starshipModules,
} from './starship';

export type Shell = 'zsh' | 'bash' | 'fish' | 'pwsh';
const SHELLS: readonly Shell[] = ['zsh', 'bash', 'fish', 'pwsh'];

/** Commands whose first argument is an alias, and those whose first argument is a source. */
const ALIAS_COMMANDS = 'use status console region mv prod rm exec';
const SOURCE_COMMANDS = 'alias login sync ls';

/** A cloud CLI the integration wraps: with an alias in use, `aws ...` runs as `hop <alias> ...`. */
export interface WrappedCli {
  command: string;
  provider: ProviderId;
}

const aliasVar = (provider: ProviderId) => `CLOUDHOP_${provider.toUpperCase()}_ALIAS`;
const prodVar = (provider: ProviderId) => `CLOUDHOP_${provider.toUpperCase()}_PROD`;

/** POSIX-ish shells share almost everything; only the `cd` hook and completion differ. */
function posixScript(shell: 'zsh' | 'bash', clis: readonly WrappedCli[]): string {
  const wrappers = clis
    .map(
      ({ command, provider }) => `${command}() {
  case " $* " in *" --profile"*) command ${command} "$@"; return $?;; esac
  if [ -n "$${aliasVar(provider)}" ] && [ "$CLOUDHOP_WRAP" != 0 ]; then
    command cloudhop "$${aliasVar(provider)}" "$@"
  else
    command ${command} "$@"
  fi
}`,
    )
    .join('\n');
  const prompt = PROVIDER_IDS.map(
    (p) =>
      `  [ -n "$${aliasVar(p)}" ] && out="$out\${out:+ }${p}:$${aliasVar(p)}\${${prodVar(p)}:+ PROD}"`,
  ).join('\n');
  const hook =
    shell === 'zsh'
      ? `autoload -Uz add-zsh-hook && add-zsh-hook chpwd _cloudhop_cd`
      : `case ";$PROMPT_COMMAND;" in *";_cloudhop_cd;"*) ;; *) PROMPT_COMMAND="_cloudhop_cd;_cloudhop_show_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac`;
  // Starship and oh-my-posh draw their own prompt: `cloudhop shell` configures Starship instead.
  const promptHook =
    shell === 'zsh'
      ? `_cloudhop_show_prompt() {
  [ "$CLOUDHOP_PROMPT" = 0 ] && return 0
  case "$PROMPT$RPROMPT" in *starship*|*oh-my-posh*|*_cloudhop_rprompt*) return 0 ;; esac
  setopt prompt_subst
  RPROMPT='$(_cloudhop_rprompt)'"\${RPROMPT:+ $RPROMPT}"
}
# Sky for the alias, rose for production, like the CLI.
_cloudhop_rprompt() {
  local p; p="$(cloudhop_prompt)"; [ -n "$p" ] || return 0
  case "$p" in *PROD*) printf '%%F{204}%s%%f' "$p" ;; *) printf '%%F{75}%s%%f' "$p" ;; esac
}
add-zsh-hook precmd _cloudhop_show_prompt`
      : `# \\001 and \\002 tell readline the colors take no room, so long lines still wrap right.
_cloudhop_ps1() {
  local p c=75; p="$(cloudhop_prompt)"; [ -n "$p" ] || return 0
  case "$p" in *PROD*) c=204 ;; esac
  printf '\\001\\033[38;5;%sm\\002[%s]\\001\\033[0m\\002 ' "$c" "$p"
}
_cloudhop_show_prompt() {
  [ "$CLOUDHOP_PROMPT" = 0 ] && return 0
  case "$PS1" in *starship*|*oh-my-posh*|*_cloudhop_ps1*) return 0 ;; esac
  PS1='$(_cloudhop_ps1)'"$PS1"
}`;
  const completion =
    shell === 'zsh'
      ? `_cloudhop_words() { command cloudhop __complete "$1" 2>/dev/null }
_hop() { (( CURRENT == 2 )) && { local -a a; a=(\${(f)"$(_cloudhop_words aliases)"}); compadd -a a; } }
_cloudhop() {
  local -a w
  if (( CURRENT == 2 )); then w=(\${(f)"$(_cloudhop_words commands)"}); compadd -a w; return; fi
  (( CURRENT == 3 )) || return
  case " ${ALIAS_COMMANDS} " in *" $words[2] "*) w=(\${(f)"$(_cloudhop_words aliases)"});; esac
  case " ${SOURCE_COMMANDS} " in *" $words[2] "*) w=(\${(f)"$(_cloudhop_words sources)"});; esac
  compadd -a w
}
(( $+functions[compdef] )) && { compdef _hop hop; compdef _cloudhop cloudhop; }`
      : `_cloudhop_complete() {
  local cur=\${COMP_WORDS[COMP_CWORD]} cmd=\${COMP_WORDS[0]##*/} kind=""
  if [ "$cmd" = hop ]; then [ "$COMP_CWORD" -eq 1 ] && kind=aliases
  elif [ "$COMP_CWORD" -eq 1 ]; then kind=commands
  elif [ "$COMP_CWORD" -eq 2 ]; then
    case " ${ALIAS_COMMANDS} " in *" \${COMP_WORDS[1]} "*) kind=aliases;; esac
    case " ${SOURCE_COMMANDS} " in *" \${COMP_WORDS[1]} "*) kind=sources;; esac
  fi
  [ -n "$kind" ] && COMPREPLY=($(compgen -W "$(command cloudhop __complete $kind 2>/dev/null)" -- "$cur"))
}
complete -o default -F _cloudhop_complete hop cloudhop`;
  return `# cloudhop shell integration (${shell}). Load it${shell === 'zsh' ? ' after compinit' : ''}:  ${LOAD_LINE[shell]}
# - \`cloudhop use <alias>\` switches this shell; \`cloudhop use --off\` goes back.
# - A folder with a trusted .cloudhoprc switches on cd (off: CLOUDHOP_AUTO_USE=0).
# - With an alias in use, \`${clis.map((c) => c.command).join('`, `') || 'aws'}\` signs in when needed and asks before changing production (off: CLOUDHOP_WRAP=0).
# - Your prompt shows the alias in use (off: CLOUDHOP_PROMPT=0).
cloudhop() {
  case "$1" in
    use)
      local out; out="$(command cloudhop use --emit ${shell} "\${@:2}")" || return $?
      eval "$out"; _cloudhop_rc_seen=\${CLOUDHOP_RC:-$_cloudhop_rc_seen} ;;
    allow|deny) command cloudhop "$@" || return $?; _cloudhop_rc_seen=-; _cloudhop_cd ;;
    *) command cloudhop "$@" ;;
  esac
}
_cloudhop_cd() {
  [ "$CLOUDHOP_AUTO_USE" = 0 ] && return
  [ "$PWD" = "$_cloudhop_pwd" ] && [ "$_cloudhop_rc_seen" != - ] && return
  _cloudhop_pwd=$PWD
  local dir=$PWD rc=
  while :; do
    if [ -f "$dir/.cloudhoprc" ]; then rc="$dir/.cloudhoprc"; break; fi
    { [ -z "$dir" ] || [ "$dir" = / ]; } && break
    dir="\${dir%/*}"
  done
  [ "$rc" = "$_cloudhop_rc_seen" ] && return
  _cloudhop_rc_seen=$rc
  local out
  if [ -n "$rc" ]; then out="$(command cloudhop use --emit ${shell} --from "$rc")"
  elif [ -n "$CLOUDHOP_RC" ]; then out="$(command cloudhop use --emit ${shell} --leave)"
  else return 0; fi
  eval "$out"
}
${hook}
_cloudhop_cd
${wrappers}
${completion}
# The aliases in use, e.g. "aws:acme-dev". Shown in your prompt by itself
# (off: CLOUDHOP_PROMPT=0); Starship gets its own segments from \`cloudhop shell\`.
cloudhop_prompt() {
  local out=
${prompt}
  [ -n "$out" ] && printf '%s' "$out"
}
${promptHook}
`;
}

function fishScript(clis: readonly WrappedCli[]): string {
  const wrappers = clis
    .map(
      ({ command, provider }) => `function ${command} --wraps ${command}
  if test -n "$${aliasVar(provider)}" -a "$CLOUDHOP_WRAP" != 0; and not string match -q -- '--profile*' $argv
    command cloudhop $${aliasVar(provider)} $argv
  else
    command ${command} $argv
  end
end`,
    )
    .join('\n');
  const prompt = PROVIDER_IDS.map(
    (p) =>
      `  test -n "$${aliasVar(p)}"; and set out $out "${p}:$${aliasVar(p)}"(test -n "$${prodVar(p)}"; and echo ' PROD')`,
  ).join('\n');
  return `# cloudhop shell integration (fish):  ${LOAD_LINE.fish}
# - \`cloudhop use <alias>\` switches this shell; \`cloudhop use --off\` goes back.
# - A folder with a trusted .cloudhoprc switches on cd (off: set -gx CLOUDHOP_AUTO_USE 0).
# - With an alias in use, the cloud CLI signs in when needed and asks before changing production (off: set -gx CLOUDHOP_WRAP 0).
function cloudhop
  switch "$argv[1]"
    case use
      set -l out (command cloudhop use --emit fish $argv[2..-1]); or return $status
      printf '%s\\n' $out | source
      set -q CLOUDHOP_RC; and set -g _cloudhop_rc_seen $CLOUDHOP_RC
    case allow deny
      command cloudhop $argv; or return $status
      set -g _cloudhop_rc_seen -
      _cloudhop_cd
    case '*'
      command cloudhop $argv
  end
end
function _cloudhop_cd --on-variable PWD
  test "$CLOUDHOP_AUTO_USE" = 0; and return
  set -l dir $PWD
  set -l rc ''
  while true
    if test -f "$dir/.cloudhoprc"; set rc "$dir/.cloudhoprc"; break; end
    if test -z "$dir" -o "$dir" = /; break; end
    set dir (string replace -r '/[^/]*$' '' -- $dir)
  end
  test "$rc" = "$_cloudhop_rc_seen"; and return
  set -g _cloudhop_rc_seen $rc
  if test -n "$rc"
    command cloudhop use --emit fish --from $rc | source
  else if test -n "$CLOUDHOP_RC"
    command cloudhop use --emit fish --leave | source
  end
end
_cloudhop_cd
${wrappers}
complete -c hop -f -n 'test (count (commandline -opc)) -eq 1' -a '(command cloudhop __complete aliases 2>/dev/null)'
complete -c cloudhop -f -n 'test (count (commandline -opc)) -eq 1' -a '(command cloudhop __complete commands 2>/dev/null)'
complete -c cloudhop -f -n '__fish_seen_subcommand_from ${ALIAS_COMMANDS}; and test (count (commandline -opc)) -eq 2' -a '(command cloudhop __complete aliases 2>/dev/null)'
complete -c cloudhop -f -n '__fish_seen_subcommand_from ${SOURCE_COMMANDS}; and test (count (commandline -opc)) -eq 2' -a '(command cloudhop __complete sources 2>/dev/null)'
# The aliases in use, e.g. "aws:acme-dev", at the right of the prompt unless
# something else (like Starship) draws it (off: set -gx CLOUDHOP_PROMPT 0).
function cloudhop_prompt
  set -l out
${prompt}
  test -n "$out"; and printf '%s' (string join ' ' $out)
end
if not functions -q fish_right_prompt
  function fish_right_prompt
    test "$CLOUDHOP_PROMPT" = 0; and return
    set -l label (cloudhop_prompt)
    test -n "$label"; or return
    if string match -q '*PROD*' -- $label; set_color fb7185; else; set_color 3bb8f5; end
    printf '%s' $label; set_color normal
  end
end
`;
}

function pwshScript(clis: readonly WrappedCli[]): string {
  const wrappers = clis
    .map(
      ({
        command,
        provider,
      }) => `$script:CloudhopCli_${provider} = (Get-Command ${command} -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
function ${command} {
  if ($env:${aliasVar(provider)} -and $env:CLOUDHOP_WRAP -ne '0' -and -not ($args -like '--profile*')) { & $script:CloudhopExe $env:${aliasVar(provider)} @args }
  elseif ($script:CloudhopCli_${provider}) { & $script:CloudhopCli_${provider} @args }
  else { Write-Error '${command}: command not found' }
}`,
    )
    .join('\n');
  const prompt = PROVIDER_IDS.map(
    (p) =>
      `  if ($env:${aliasVar(p)}) { $out += "${p}:$env:${aliasVar(p)}$(if ($env:${prodVar(p)}) { ' PROD' })" }`,
  ).join('\n');
  return `# cloudhop shell integration (PowerShell):  ${LOAD_LINE.pwsh}
# - \`cloudhop use <alias>\` switches this shell; \`cloudhop use --off\` goes back.
# - A folder with a trusted .cloudhoprc switches on cd (off: $env:CLOUDHOP_AUTO_USE = '0').
# - With an alias in use, the cloud CLI signs in when needed and asks before changing production (off: $env:CLOUDHOP_WRAP = '0').
$script:CloudhopExe = (Get-Command cloudhop -CommandType Application, ExternalScript | Select-Object -First 1).Source
function cloudhop {
  if ($args.Count -gt 0 -and $args[0] -eq 'use') {
    $out = & $script:CloudhopExe use --emit pwsh @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -eq 0) { $out | Out-String | Invoke-Expression; if ($env:CLOUDHOP_RC) { $script:CloudhopRcSeen = $env:CLOUDHOP_RC } }
  } elseif ($args.Count -gt 0 -and $args[0] -in 'allow', 'deny') {
    & $script:CloudhopExe @args
    if ($LASTEXITCODE -eq 0) { $script:CloudhopRcSeen = '-'; $script:CloudhopPwd = ''; _CloudhopCd }
  } else { & $script:CloudhopExe @args }
}
function _CloudhopCd {
  if ($env:CLOUDHOP_AUTO_USE -eq '0' -or $PWD.ProviderPath -eq $script:CloudhopPwd) { return }
  $script:CloudhopPwd = $PWD.ProviderPath
  $dir = $PWD.ProviderPath; $rc = ''
  while ($dir) {
    $file = Join-Path $dir '.cloudhoprc'
    if (Test-Path -LiteralPath $file -PathType Leaf) { $rc = $file; break }
    $dir = Split-Path -Parent $dir
  }
  if ($rc -eq $script:CloudhopRcSeen) { return }
  $script:CloudhopRcSeen = $rc
  $out = if ($rc) { & $script:CloudhopExe use --emit pwsh --from $rc } elseif ($env:CLOUDHOP_RC) { & $script:CloudhopExe use --emit pwsh --leave }
  if ($out) { $out | Out-String | Invoke-Expression }
}
$script:CloudhopPrompt = $function:prompt
function prompt {
  _CloudhopCd
  $out = & $script:CloudhopPrompt
  # The alias in use before your prompt, unless Starship draws it (off: $env:CLOUDHOP_PROMPT = '0').
  if ($env:CLOUDHOP_PROMPT -ne '0' -and "$script:CloudhopPrompt" -notmatch 'starship|oh-my-posh') {
    $label = cloudhop_prompt
    if ($label) {
      if (-not $Host.UI.SupportsVirtualTerminal) { return "[$label] $out" }
      $color = if ($label -match 'PROD') { 204 } else { 75 }
      return "$([char]27)[38;5;$($color)m[$label]$([char]27)[0m $out"
    }
  }
  $out
}
${wrappers}
Register-ArgumentCompleter -Native -CommandName hop, cloudhop -ScriptBlock {
  param($word, $ast)
  $n = $ast.CommandElements.Count - [int]($word -eq '')
  $kind = if ($ast.CommandElements[0].Value -match 'hop$' -and $ast.CommandElements[0].Value -notmatch 'cloudhop') { if ($n -le 1) { 'aliases' } }
          elseif ($n -le 1) { 'commands' }
          elseif ($n -eq 2 -and ' ${ALIAS_COMMANDS} ' -match " $($ast.CommandElements[1].Value) ") { 'aliases' }
          elseif ($n -eq 2 -and ' ${SOURCE_COMMANDS} ' -match " $($ast.CommandElements[1].Value) ") { 'sources' }
  if ($kind) { & $script:CloudhopExe __complete $kind | Where-Object { $_ -like "$word*" } }
}
function cloudhop_prompt {
  $out = @()
${prompt}
  $out -join ' '
}
`;
}

/** The integration script for a shell, wrapping the CLIs of the clouds cloudhop supports. */
export function shellScript(shell: Shell, clis: readonly WrappedCli[]): string {
  if (shell === 'fish') return fishScript(clis);
  if (shell === 'pwsh') return pwshScript(clis);
  return posixScript(shell, clis);
}

/** What `cloudhop shell starship` prints, for people who edit their config by hand. */
export function starshipSnippet(): string {
  return `# cloudhop: the alias each cloud uses in this shell (\`cloudhop use\`, .cloudhoprc).
# \`cloudhop shell\` adds this for you. By hand: append it to starship.toml and, if
# your config has a top-level \`format\`, add this where you want the segments:
#   ${STARSHIP_SEGMENTS}

${starshipModules()}
`;
}

const quote = (shell: Shell, value: string) =>
  shell === 'pwsh' ? `'${value.replace(/'/g, "''")}'` : `'${value.replace(/'/g, "'\\''")}'`;

/** Shell code that sets (or removes) environment variables in the user's current shell. */
export function shellExports(shell: Shell, env: ProcessEnv): string {
  return Object.entries(env)
    .map(([key, value]) => {
      if (value === undefined) {
        if (shell === 'fish') return `set -e ${key}`;
        if (shell === 'pwsh') return `Remove-Item Env:${key} -ErrorAction SilentlyContinue`;
        return `unset ${key}`;
      }
      if (shell === 'fish') return `set -gx ${key} ${quote(shell, value)}`;
      if (shell === 'pwsh') return `$env:${key} = ${quote(shell, value)}`;
      return `export ${key}=${quote(shell, value)}`;
    })
    .join('\n');
}

export function detectShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  const name = (process.env.SHELL ?? '').split('/').pop();
  return SHELLS.includes(name as Shell) ? (name as Shell) : 'bash';
}

export function parseShell(value: string | undefined): Shell {
  if (!value) return detectShell();
  const shell = value === 'powershell' ? 'pwsh' : value;
  if (!SHELLS.includes(shell as Shell)) {
    throw new CloudhopError(
      'INVALID_NAME',
      `Unknown shell "${value}".`,
      `Use one of: ${SHELLS.join(', ')}.`,
    );
  }
  return shell as Shell;
}

const RC_FILES: Record<Shell, (home: string) => string> = {
  zsh: (home) => join(home, '.zshrc'),
  bash: (home) => join(home, '.bashrc'),
  fish: (home) => join(home, '.config', 'fish', 'config.fish'),
  pwsh: (home) =>
    process.platform === 'win32'
      ? join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
      : join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'),
};
export const LOAD_LINE: Record<Shell, string> = {
  zsh: 'eval "$(cloudhop shell zsh)"',
  bash: 'eval "$(cloudhop shell bash)"',
  fish: 'cloudhop shell fish | source',
  pwsh: 'cloudhop shell pwsh | Out-String | Invoke-Expression',
};

/** True when the user's shell loads the integration (and Starship, if used, shows the alias). */
export function shellIntegrationInstalled(): boolean {
  const shell = detectShell();
  const read = (file: string) => {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
  };
  const rc = read(RC_FILES[shell](homedir())) ?? '';
  if (!rc.includes(LOAD_LINE[shell])) return false;
  const starship = read(starshipFile());
  if (starship === undefined) return !rc.includes('starship init');
  return hasCloudhopStarship(starship);
}

const starshipFile = () =>
  process.env.STARSHIP_CONFIG || join(homedir(), '.config', 'starship.toml');

/**
 * `cloudhop shell [zsh|bash|fish|pwsh]` prints the integration script;
 * `cloudhop shell` in a terminal, or `cloudhop shell install [shell]`, adds the line that loads it to the shell's
 * startup file (after asking); `cloudhop shell starship` prints the prompt
 * segments for Starship.
 */
export async function shellCommand(args: string[], clis: readonly WrappedCli[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  if (positional[0] === 'starship') {
    process.stdout.write(starshipSnippet());
    return;
  }
  // `cloudhop shell` typed in a terminal means "set it up"; the startup line
  // (`eval "$(cloudhop shell zsh)"`) names the shell and captures the output.
  const setUp = positional[0] === 'install' || (!positional[0] && process.stdout.isTTY);
  if (!setUp) {
    process.stdout.write(shellScript(parseShell(positional[0]), clis));
    return;
  }
  const shell = parseShell(positional[1]);
  const file = RC_FILES[shell](homedir());
  const line = LOAD_LINE[shell];
  const current = (await readIfExists(file)) ?? '';
  const starship = await starshipConfig(current);
  const needsLine = !current.includes(line);
  const needsStarship = starship !== undefined && !hasCloudhopStarship(starship.text);
  const rcName = file.replace(homedir(), '~');

  if (!needsLine && !needsStarship) {
    console.log(`Already set up in ${rcName}${starship ? ' and your Starship prompt' : ''}.`);
    return;
  }
  const changes = [
    needsLine &&
      `add one line to ${rcName}: \`cloudhop use\`, .cloudhoprc folders, the alias in your prompt`,
    needsStarship &&
      `show the alias in your Starship prompt (${starship.file.replace(homedir(), '~')}, keeping a backup)`,
  ].filter(Boolean);
  if (!flags.yes) {
    if (!interactive())
      throw new CloudhopError(
        'NOT_INTERACTIVE',
        `Rerun with --yes to ${changes.join(' and ')}.${needsLine ? `\nOr add this line to ${file} yourself:\n  ${line}` : ''}`,
      );
    console.log(`cloudhop will:\n${changes.map((c) => `  - ${c}`).join('\n')}`);
    const ok = answer(await p.confirm({ message: 'Set up your terminal?', initialValue: true }));
    if (!ok) return;
  }
  if (needsLine) {
    await mkdir(dirname(file), { recursive: true });
    const note = shell === 'zsh' ? '  # after compinit' : '';
    await appendFile(
      file,
      `${current && !current.endsWith('\n') ? '\n' : ''}\n# cloudhop: \`cloudhop use\`, .cloudhoprc folders, tab completion, prompt${note}\n${line}\n`,
    );
    console.log(`${paint('green', '✔')} Added to ${rcName}.`);
  }
  if (needsStarship) {
    await mkdir(dirname(starship.file), { recursive: true });
    // The backup is what we read, so it matches what we changed.
    if (starship.exists) await writeFile(`${starship.file}.cloudhop-backup`, starship.text);
    await writeFile(starship.file, addToStarshipConfig(starship.text));
    console.log(
      `${paint('green', '✔')} Your Starship prompt shows the alias in use (backup: ${starship.file.replace(homedir(), '~')}.cloudhop-backup).`,
    );
  }
  console.log(
    `Open a new terminal (or run ${paint('sky', shell === 'pwsh' ? '. $PROFILE' : `exec ${shell}`)}), then:`,
  );
  console.log(`  ${paint('sky', 'cloudhop use <alias>')}   switch this terminal to an account`);
  console.log(`  ${paint('sky', 'aws s3 ls')}              plain aws commands, as that alias`);
}

/** The Starship config to extend, when this shell uses Starship. */
async function starshipConfig(
  rc: string,
): Promise<{ file: string; text: string; exists: boolean } | undefined> {
  const file = starshipFile();
  const text = await readIfExists(file);
  if (text === undefined && !rc.includes('starship init') && !process.env.STARSHIP_SHELL) {
    return undefined;
  }
  return { file, text: text ?? '', exists: text !== undefined };
}

/** The file's text, or undefined when it doesn't exist (read once: no check-then-read race). */
async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** `cloudhop __complete <aliases|sources|commands>`: words for tab completion, one per line. */
export async function completeCommand(app: CloudhopApp, kind: string | undefined): Promise<void> {
  if (kind === 'commands') {
    console.log(
      [...RESERVED_NAMES, 'each', 'shell', 'use']
        .filter((c, i, a) => a.indexOf(c) === i)
        .sort()
        .join('\n'),
    );
    return;
  }
  const config = await app.config();
  const words =
    kind === 'sources' ? config.sources.map((s) => s.id) : config.aliases.map((a) => a.name);
  if (words.length) console.log(words.join('\n'));
}
