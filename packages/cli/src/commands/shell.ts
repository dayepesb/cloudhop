import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CloudhopApp, CloudhopError, type ProcessEnv, RESERVED_NAMES } from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { pickAlias } from '../picker';
import { answer, notify, p, paint } from '../ui';

export type Shell = 'zsh' | 'bash' | 'fish' | 'pwsh';
const SHELLS: readonly Shell[] = ['zsh', 'bash', 'fish', 'pwsh'];

/** Commands whose first argument is an alias, and those whose first argument is a source. */
const ALIAS_COMMANDS = 'use status console region mv prod rm exec';
const SOURCE_COMMANDS = 'alias login sync ls';

const SCRIPTS: Record<Shell, string> = {
  zsh: `# cloudhop shell integration (zsh). Load it after compinit:  eval "$(cloudhop shell zsh)"
cloudhop() {
  if [ "$1" = "use" ]; then
    local out; out="$(command cloudhop use --emit zsh "\${@:2}")" || return $?
    eval "$out"
  else
    command cloudhop "$@"
  fi
}
_cloudhop_words() { command cloudhop __complete "$1" 2>/dev/null }
_hop() { (( CURRENT == 2 )) && { local -a a; a=(\${(f)"$(_cloudhop_words aliases)"}); compadd -a a; } }
_cloudhop() {
  local -a w
  if (( CURRENT == 2 )); then w=(\${(f)"$(_cloudhop_words commands)"}); compadd -a w; return; fi
  (( CURRENT == 3 )) || return
  case " ${ALIAS_COMMANDS} " in *" $words[2] "*) w=(\${(f)"$(_cloudhop_words aliases)"});; esac
  case " ${SOURCE_COMMANDS} " in *" $words[2] "*) w=(\${(f)"$(_cloudhop_words sources)"});; esac
  compadd -a w
}
(( $+functions[compdef] )) && { compdef _hop hop; compdef _cloudhop cloudhop; }
# Add $(cloudhop_prompt) to your prompt to see the alias set with \`cloudhop use\`.
cloudhop_prompt() { [ -n "$CLOUDHOP_ALIAS" ] && printf '☁ %s%s' "$CLOUDHOP_ALIAS" "\${CLOUDHOP_PROD:+ PROD}"; }
`,
  bash: `# cloudhop shell integration (bash):  eval "$(cloudhop shell bash)"
cloudhop() {
  if [ "$1" = "use" ]; then
    local out; out="$(command cloudhop use --emit bash "\${@:2}")" || return $?
    eval "$out"
  else
    command cloudhop "$@"
  fi
}
_cloudhop_complete() {
  local cur=\${COMP_WORDS[COMP_CWORD]} cmd=\${COMP_WORDS[0]##*/} kind=""
  if [ "$cmd" = hop ]; then [ "$COMP_CWORD" -eq 1 ] && kind=aliases
  elif [ "$COMP_CWORD" -eq 1 ]; then kind=commands
  elif [ "$COMP_CWORD" -eq 2 ]; then
    case " ${ALIAS_COMMANDS} " in *" \${COMP_WORDS[1]} "*) kind=aliases;; esac
    case " ${SOURCE_COMMANDS} " in *" \${COMP_WORDS[1]} "*) kind=sources;; esac
  fi
  [ -n "$kind" ] && COMPREPLY=($(compgen -W "$(command cloudhop __complete $kind 2>/dev/null)" -- "$cur"))
}
complete -o default -F _cloudhop_complete hop cloudhop
# Add $(cloudhop_prompt) to PS1 to see the alias set with \`cloudhop use\`.
cloudhop_prompt() { [ -n "$CLOUDHOP_ALIAS" ] && printf '☁ %s%s' "$CLOUDHOP_ALIAS" "\${CLOUDHOP_PROD:+ PROD}"; }
`,
  fish: `# cloudhop shell integration (fish):  cloudhop shell fish | source
function cloudhop
  if test "$argv[1]" = use
    set -l out (command cloudhop use --emit fish $argv[2..-1]); or return $status
    printf '%s\\n' $out | source
  else
    command cloudhop $argv
  end
end
complete -c hop -f -n 'test (count (commandline -opc)) -eq 1' -a '(command cloudhop __complete aliases 2>/dev/null)'
complete -c cloudhop -f -n 'test (count (commandline -opc)) -eq 1' -a '(command cloudhop __complete commands 2>/dev/null)'
complete -c cloudhop -f -n '__fish_seen_subcommand_from ${ALIAS_COMMANDS}; and test (count (commandline -opc)) -eq 2' -a '(command cloudhop __complete aliases 2>/dev/null)'
complete -c cloudhop -f -n '__fish_seen_subcommand_from ${SOURCE_COMMANDS}; and test (count (commandline -opc)) -eq 2' -a '(command cloudhop __complete sources 2>/dev/null)'
# Call cloudhop_prompt from fish_prompt to see the alias set with \`cloudhop use\`.
function cloudhop_prompt
  test -n "$CLOUDHOP_ALIAS"; and printf '☁ %s%s' $CLOUDHOP_ALIAS (test -n "$CLOUDHOP_PROD"; and echo ' PROD')
end
`,
  pwsh: `# cloudhop shell integration (PowerShell):  cloudhop shell pwsh | Out-String | Invoke-Expression
$script:CloudhopExe = (Get-Command cloudhop -CommandType Application, ExternalScript | Select-Object -First 1).Source
function cloudhop {
  if ($args.Count -gt 0 -and $args[0] -eq 'use') {
    $out = & $script:CloudhopExe use --emit pwsh @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -eq 0) { $out | Out-String | Invoke-Expression }
  } else { & $script:CloudhopExe @args }
}
Register-ArgumentCompleter -Native -CommandName hop, cloudhop -ScriptBlock {
  param($word, $ast)
  $n = $ast.CommandElements.Count - [int]($word -eq '')
  $kind = if ($ast.CommandElements[0].Value -match 'hop$' -and $ast.CommandElements[0].Value -notmatch 'cloudhop') { if ($n -le 1) { 'aliases' } }
          elseif ($n -le 1) { 'commands' }
          elseif ($n -eq 2 -and ' ${ALIAS_COMMANDS} ' -match " $($ast.CommandElements[1].Value) ") { 'aliases' }
          elseif ($n -eq 2 -and ' ${SOURCE_COMMANDS} ' -match " $($ast.CommandElements[1].Value) ") { 'sources' }
  if ($kind) { & $script:CloudhopExe __complete $kind | Where-Object { $_ -like "$word*" } }
}
function cloudhop_prompt { if ($env:CLOUDHOP_ALIAS) { "☁ $env:CLOUDHOP_ALIAS$(if ($env:CLOUDHOP_PROD) { ' PROD' })" } }
`,
};

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

function detectShell(): Shell {
  if (process.platform === 'win32') return 'pwsh';
  const name = (process.env.SHELL ?? '').split('/').pop();
  return SHELLS.includes(name as Shell) ? (name as Shell) : 'bash';
}

function parseShell(value: string | undefined): Shell {
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
const LOAD_LINE: Record<Shell, string> = {
  zsh: 'eval "$(cloudhop shell zsh)"',
  bash: 'eval "$(cloudhop shell bash)"',
  fish: 'cloudhop shell fish | source',
  pwsh: 'cloudhop shell pwsh | Out-String | Invoke-Expression',
};

/**
 * `cloudhop shell [zsh|bash|fish|pwsh]` prints the integration script;
 * `cloudhop shell install [shell]` adds the line that loads it to the shell's
 * startup file (after asking).
 */
export async function shellCommand(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  if (positional[0] !== 'install') {
    process.stdout.write(SCRIPTS[parseShell(positional[0])]);
    return;
  }
  const shell = parseShell(positional[1]);
  const file = RC_FILES[shell](homedir());
  const line = LOAD_LINE[shell];
  const current = existsSync(file) ? await readFile(file, 'utf8') : '';
  if (current.includes(line)) {
    console.log(`Already set up in ${file.replace(homedir(), '~')}.`);
    return;
  }
  if (!flags.yes) {
    if (!interactive())
      throw new CloudhopError(
        'NOT_INTERACTIVE',
        `Add this line to ${file} yourself, or rerun with --yes:\n  ${line}`,
      );
    const ok = answer(
      await p.confirm({
        message: `Add cloudhop to ${file.replace(homedir(), '~')}?`,
        initialValue: true,
      }),
    );
    if (!ok) return;
  }
  await mkdir(dirname(file), { recursive: true });
  const note = shell === 'zsh' ? '  # after compinit' : '';
  await appendFile(
    file,
    `${current && !current.endsWith('\n') ? '\n' : ''}\n# cloudhop: \`cloudhop use\`, tab completion and cloudhop_prompt${note}\n${line}\n`,
  );
  console.log(
    `${paint('green', '✔')} Added to ${file.replace(homedir(), '~')}. Open a new terminal to use it.`,
  );
}

/**
 * `cloudhop use <alias> | --off`: makes the current shell use an alias, so
 * `aws`, Terraform and SDKs work without `hop`. Needs the shell integration,
 * which evals what this prints with `--emit <shell>`.
 */
export async function useCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const shell = flags.emit ? parseShell(flags.emit) : undefined;
  if (!shell) {
    throw new CloudhopError(
      'NOT_INTERACTIVE',
      '`cloudhop use` needs the shell integration to change your current shell.',
      `Set it up once with \`cloudhop shell install\` (or add ${LOAD_LINE[detectShell()]} to your shell's startup file), then open a new terminal.`,
    );
  }
  const clear = {
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
  };
  if (flags.off) {
    process.stdout.write(
      `${shellExports(shell, { ...clear, AWS_PROFILE: undefined, AWS_REGION: undefined, AWS_DEFAULT_REGION: undefined, CLOUDHOP_ALIAS: undefined, CLOUDHOP_PROD: undefined })}\n`,
    );
    notify('No alias in this shell anymore.');
    return;
  }
  const alias = positional[0] ?? (await pickAlias(app, 'Use which alias in this shell?'));
  const env = await app.envForAlias(alias, 'cli');
  const status = await app.aliasStatus(alias);
  process.stdout.write(
    `${shellExports(shell, { ...clear, ...env, CLOUDHOP_ALIAS: alias, CLOUDHOP_PROD: status.prod ? '1' : undefined })}\n`,
  );
  notify(
    `This shell now uses ${alias} (${status.label ?? status.target}, ${status.region ?? 'no region'}).`,
  );
  if (status.prod) {
    notify(
      paint(
        'red',
        `${alias} is production. Plain \`aws\` commands are not protected here: use \`hop ${alias}\` to be asked before changes.`,
      ),
    );
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
