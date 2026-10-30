import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { findFolderFile, readFolderFile, type TrustedFolders } from '@cloudhop/adapters-node';
import {
  type CloudhopApp,
  CloudhopError,
  FOLDER_FILE,
  type FolderAliases,
  formatFolderFile,
  PROVIDER_IDS,
  type ProcessEnv,
  type ProviderId,
  parseFolderFile,
} from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { pickAlias } from '../picker';
import { bold, notify, paint } from '../ui';
import { detectShell, LOAD_LINE, parseShell, shellExports } from './shell';

/**
 * The variables `cloudhop use` keeps per cloud, so an AWS alias and a Google
 * Cloud one can be active in the same shell: `CLOUDHOP_AWS_ALIAS`,
 * `CLOUDHOP_AWS_PROD` ("1" for production) and `CLOUDHOP_AWS_PROMPT`
 * ("alias (region)", ready for a prompt).
 */
export const activeVars = (provider: ProviderId) => {
  const prefix = `CLOUDHOP_${provider.toUpperCase()}`;
  return {
    alias: `${prefix}_ALIAS`,
    prod: `${prefix}_PROD`,
    prompt: `${prefix}_PROMPT`,
    // One or the other, so prompt themes can style production apart (Starship's env_var).
    segment: `${prefix}_SEGMENT`,
    prodSegment: `${prefix}_PROD_SEGMENT`,
  };
};

/** The alias each cloud uses in this shell, read from the environment. */
export function activeAliases(
  env: NodeJS.ProcessEnv = process.env,
): Partial<Record<ProviderId, string>> {
  return Object.fromEntries(
    PROVIDER_IDS.filter((p) => env[activeVars(p).alias]).map((p) => [p, env[activeVars(p).alias]]),
  );
}

/**
 * Hints for scripts and AI assistants (`ls --json`, the MCP `list_aliases`):
 * the aliases this shell switched to, and the `.cloudhoprc` of the folder,
 * trusted or not. Hints only: assistants still ask the user.
 */
export async function shellContext(trusted: TrustedFolders, cwd = process.cwd()) {
  const file = findFolderFile(cwd);
  const content = file ? await readFolderFile(file) : undefined;
  let folder: { file: string; aliases: FolderAliases; trusted: boolean } | undefined;
  if (file && content !== undefined) {
    try {
      folder = {
        file,
        aliases: parseFolderFile(content),
        trusted: trusted.isTrusted(file, content),
      };
    } catch {
      // An invalid file is no hint at all.
    }
  }
  return { inUse: activeAliases(), ...(folder ? { folder } : {}) };
}

const tilde = (path: string) => path.replace(homedir(), '~');

/**
 * Clouds that cloudhop switched on by itself, from the folder's file or the
 * default alias: another folder or leaving this one may switch them again.
 * Clouds the user picked with `cloudhop use` stay until they pick again.
 */
const folderProviders = (): ProviderId[] =>
  (process.env.CLOUDHOP_RC_PROVIDERS ?? '')
    .split(',')
    .filter((p): p is ProviderId => PROVIDER_IDS.includes(p as ProviderId));

interface Activation {
  provider: ProviderId;
  env: ProcessEnv;
  summary: string;
  prod: boolean;
}

async function activate(app: CloudhopApp, alias: string, login: boolean): Promise<Activation> {
  const shellEnv = await app.shellEnv(alias, { login });
  const vars = activeVars(shellEnv.provider);
  const label = shellEnv.region ? `${alias} (${shellEnv.region})` : alias;
  const env: ProcessEnv = Object.fromEntries(shellEnv.clear.map((name) => [name, undefined]));
  Object.assign(env, shellEnv.env, {
    [vars.alias]: alias,
    [vars.prod]: shellEnv.prod ? '1' : undefined,
    [vars.prompt]: label,
    [vars.segment]: shellEnv.prod ? undefined : label,
    [vars.prodSegment]: shellEnv.prod ? label : undefined,
    // The cloud-neutral pair from cloudhop 1.2, kept for prompts already using it.
    CLOUDHOP_ALIAS: alias,
    CLOUDHOP_PROD: shellEnv.prod ? '1' : undefined,
  });
  const where = [shellEnv.label, shellEnv.region ?? 'no region'].filter(Boolean).join(', ');
  return { provider: shellEnv.provider, env, summary: `${alias} (${where})`, prod: shellEnv.prod };
}

function deactivate(app: CloudhopApp, provider: ProviderId): ProcessEnv {
  const vars = activeVars(provider);
  const env: ProcessEnv = Object.fromEntries(app.shellVars(provider).map((n) => [n, undefined]));
  for (const name of Object.values(vars)) env[name] = undefined;
  if (process.env.CLOUDHOP_ALIAS && process.env.CLOUDHOP_ALIAS === process.env[vars.alias]) {
    Object.assign(env, { CLOUDHOP_ALIAS: undefined, CLOUDHOP_PROD: undefined });
  }
  return env;
}

function warnProduction(activation: Activation): void {
  if (!activation.prod) return;
  const alias = activation.summary.split(' ')[0];
  notify(
    paint(
      'red',
      `${alias} is production: with the shell integration, \`aws\` asks before changes. Other tools (terraform, scripts) don't.`,
    ),
  );
}

/**
 * `cloudhop use <alias> [--save] [--default] | --off [cloud] | --no-default [cloud]`:
 * makes the current shell use an alias, so `aws`, Terraform and SDKs work
 * without `hop`. With the shell integration it changes this same shell (it
 * evals what `--emit <shell>` prints); without it, it opens a new shell that
 * uses the alias. `--default` also makes new terminals start with it.
 * `--from <file>` and `--leave` are what the integration runs on `cd` and
 * when a terminal opens.
 */
export async function useCommand(
  app: CloudhopApp,
  trusted: TrustedFolders,
  args: string[],
): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const shell = flags.emit ? parseShell(flags.emit) : undefined;

  if (flags.from !== undefined || flags.leave) {
    if (!shell) throw new CloudhopError('INVALID_NAME', '--from and --leave need --emit <shell>.');
    const env = await folderEnv(app, trusted, flags.leave ? undefined : flags.from);
    process.stdout.write(`${shellExports(shell, env)}\n`);
    return 0;
  }

  if (flags.noDefault) {
    const which = positional[0];
    const cleared = await app.clearDefaultAlias(which ? cloudArg(which) : undefined);
    if (shell) process.stdout.write('\n');
    notify(
      cleared.length
        ? `New terminals no longer start with ${cleared.join(', ')}. This one keeps what it uses.`
        : 'There was no default alias.',
    );
    return 0;
  }

  if (flags.off) {
    if (!shell) throw noIntegration('Nothing to turn off: this shell has no cloudhop integration.');
    const which = positional[0];
    const providers = which
      ? [cloudArg(which)]
      : app.availableProviders().map((provider) => provider.id);
    const env: ProcessEnv = {};
    for (const provider of providers) Object.assign(env, deactivate(app, provider));
    const remaining = folderProviders().filter((p) => !providers.includes(p));
    Object.assign(
      env,
      folderMarks(remaining.length ? process.env.CLOUDHOP_RC : undefined, remaining),
    );
    process.stdout.write(`${shellExports(shell, env)}\n`);
    notify(which ? `No ${which} alias in this shell anymore.` : 'No alias in this shell anymore.');
    return 0;
  }

  const alias = positional[0] ?? (await pickAlias(app, 'Use which alias in this shell?'));
  const activation = await activate(app, alias, true);

  if (flags.default) {
    if (activation.prod && !flags.yes) {
      throw new CloudhopError(
        'PROD_CONFIRMATION_REQUIRED',
        `${alias} is production: every new terminal would start in it.`,
        `If that's what you want, run \`cloudhop use ${alias} --default --yes\`.`,
      );
    }
    await app.setDefaultAlias(alias);
  }
  let folder: string | undefined;
  if (flags.save) folder = await saveFolderFile(trusted, activation.provider, alias);

  if (!shell) {
    if (!interactive()) {
      throw noIntegration('`cloudhop use` needs a terminal or the shell integration.');
    }
    return subshell(alias, activation);
  }

  // This cloud is now the user's choice, not the folder's: leaving the folder keeps it.
  const fromFolder = folderProviders().filter((p) => p !== activation.provider);
  const env: ProcessEnv = { ...activation.env };
  if (folder) Object.assign(env, folderMarks(folder, [...fromFolder, activation.provider]));
  else
    Object.assign(
      env,
      folderMarks(fromFolder.length ? process.env.CLOUDHOP_RC : undefined, fromFolder),
    );
  process.stdout.write(`${shellExports(shell, env)}\n`);
  notify(`This shell now uses ${activation.summary}.`);
  if (flags.default) notify(`New terminals start with ${alias}.`);
  if (folder) notify(`Saved in ${tilde(folder)}: this folder switches to ${alias} on cd.`);
  warnProduction(activation);
  return 0;
}

/** The file of the folder (if any) and the clouds cloudhop switched on by itself. */
const folderMarks = (file: string | undefined, providers: readonly ProviderId[]): ProcessEnv => ({
  CLOUDHOP_RC: providers.length && file ? file : undefined,
  CLOUDHOP_RC_PROVIDERS: providers.length ? providers.join(',') : undefined,
});

function cloudArg(which: string): ProviderId {
  if (PROVIDER_IDS.includes(which as ProviderId)) return which as ProviderId;
  throw new CloudhopError(
    'INVALID_NAME',
    `Unknown cloud "${which}".`,
    `Use one of: ${PROVIDER_IDS.join(', ')}, or nothing for all of them.`,
  );
}

const noIntegration = (message: string) =>
  new CloudhopError(
    'NOT_INTERACTIVE',
    message,
    `Set it up once with \`cloudhop shell install\` (or add ${LOAD_LINE[detectShell()]} to your shell's startup file), then open a new terminal.`,
  );

/**
 * What the shell integration evals on `cd` and when a terminal opens: the
 * aliases of a trusted folder file (`file`), the default alias for the other
 * clouds, minus those of the folder it left. A cloud the user picked with
 * `cloudhop use` keeps its alias unless the folder names one. It never signs
 * in or prompts, and a problem is a one-line note: it must never break `cd`.
 */
async function folderEnv(
  app: CloudhopApp,
  trusted: TrustedFolders,
  file: string | undefined,
): Promise<ProcessEnv> {
  const previous = folderProviders();
  const activations: Activation[] = [];
  const path = file ? resolve(file) : undefined;
  const content = path ? await readFolderFile(path) : undefined;

  if (path && content !== undefined) {
    let aliases: FolderAliases | undefined;
    try {
      aliases = parseFolderFile(content);
    } catch (error) {
      notify(`${tilde(path)}: ${(error as Error).message}`);
    }
    if (aliases && !trusted.isTrusted(path, content)) {
      notify(
        `${tilde(path)} wants this folder to use ${Object.values(aliases).join(', ')}. ` +
          `Run ${bold('cloudhop allow')} if you trust it.`,
      );
    } else if (aliases) {
      for (const alias of Object.values(aliases)) {
        try {
          activations.push(await activate(app, alias, false));
        } catch (error) {
          notify(`${tilde(path)}: ${(error as Error).message}`);
        }
      }
    }
  }

  const fromFolder = activations.map((a) => a.provider);
  const defaults: Activation[] = [];
  for (const [provider, alias] of Object.entries(await defaultAliases(app))) {
    if (fromFolder.includes(provider as ProviderId)) continue;
    const picked = process.env[activeVars(provider as ProviderId).alias];
    if (picked && !previous.includes(provider as ProviderId)) continue;
    try {
      defaults.push(await activate(app, alias as string, false));
    } catch (error) {
      notify(`Default alias: ${(error as Error).message}`);
    }
  }

  const applied = [...fromFolder, ...defaults.map((a) => a.provider)];
  const env: ProcessEnv = {};
  const left = previous.filter((p) => !applied.includes(p));
  for (const provider of left) Object.assign(env, deactivate(app, provider));
  for (const activation of [...activations, ...defaults]) Object.assign(env, activation.env);
  Object.assign(env, folderMarks(path, applied));

  // A new terminal on its default says nothing: the prompt shows it.
  const back = defaults.filter((a) => previous.includes(a.provider));
  if (activations.length) {
    notify(`Using ${activations.map((a) => a.summary).join(' and ')}, from ${FOLDER_FILE}.`);
  } else if (back.length) {
    notify(`Back to your default ${back.map((a) => a.summary).join(' and ')}.`);
  }
  const gone = left.map((p) => process.env[activeVars(p).alias]).filter(Boolean);
  if (!activations.length && !back.length && gone.length) {
    notify(`Left the folder of ${gone.join(', ')}: no alias in this shell.`);
  }
  for (const activation of [...activations, ...defaults]) warnProduction(activation);
  return env;
}

/** A broken config must not break `cd` either. */
async function defaultAliases(app: CloudhopApp): Promise<Partial<Record<ProviderId, string>>> {
  try {
    return await app.defaultAliases();
  } catch {
    return {};
  }
}

async function saveFolderFile(
  trusted: TrustedFolders,
  provider: ProviderId,
  alias: string,
): Promise<string> {
  const file = join(process.cwd(), FOLDER_FILE);
  const content = await readFolderFile(file);
  let aliases: FolderAliases = {};
  if (content !== undefined) {
    aliases = parseFolderFile(content);
    // A bare alias name can't say which cloud it is for: keep only explicit lines.
    delete aliases.any;
  }
  aliases[provider] = alias;
  const text = formatFolderFile(aliases);
  await writeFile(file, text);
  await trusted.trust(file, text);
  return file;
}

/** Without the shell integration, `cloudhop use` opens a new shell that uses the alias. */
function subshell(alias: string, activation: Activation): number {
  const env: NodeJS.ProcessEnv = { ...process.env, CLOUDHOP_SUBSHELL: alias };
  for (const [name, value] of Object.entries(activation.env)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  const shell =
    process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : (process.env.SHELL ?? '/bin/sh');
  // cmd.exe takes its prompt from PROMPT: show the alias there. Other shells
  // set their own prompt on start; the integration labels those.
  if (/cmd(\.exe)?$/i.test(shell)) {
    const label = `${activation.provider}:${alias}${activation.prod ? ' PROD' : ''}`;
    env.PROMPT = `[${label}] ${process.env.PROMPT ?? '$P$G'}`;
  }
  if (process.env.CLOUDHOP_SUBSHELL) {
    notify(
      `You are already in a cloudhop shell (${process.env.CLOUDHOP_SUBSHELL}): this one goes inside it.`,
    );
  }
  notify(`New shell using ${activation.summary}. Type ${bold('exit')} to go back.`);
  notify(
    paint(
      'dim',
      'Tip: `cloudhop shell install` makes `cloudhop use` switch this same terminal instead.',
    ),
  );
  warnProduction(activation);
  const result = spawnSync(shell, [], { stdio: 'inherit', env });
  notify(`Back from ${alias}.`);
  return result.status ?? 0;
}

/**
 * `cloudhop allow [file|folder]`: trusts a folder file, so `cd` may switch to its aliases.
 * `cloudhop deny [file|folder]` forgets it again.
 */
export async function allowCommand(
  app: CloudhopApp,
  trusted: TrustedFolders,
  args: string[],
  allow: boolean,
): Promise<void> {
  const { positional } = parseArgs(args);
  const given = positional[0];
  const file = given
    ? given.endsWith(FOLDER_FILE)
      ? resolve(given)
      : join(resolve(given), FOLDER_FILE)
    : findFolderFile(process.cwd());
  if (!file) {
    throw new CloudhopError(
      'INVALID_NAME',
      `No ${FOLDER_FILE} in this folder or above it.`,
      'Create one with `cloudhop use <alias> --save`.',
    );
  }
  if (!allow) {
    const forgotten = await trusted.forget(file);
    console.log(
      forgotten
        ? `${paint('green', '✔')} ${tilde(file)} is no longer trusted: its folder won't switch aliases.`
        : `${tilde(file)} was not trusted.`,
    );
    return;
  }
  const content = await readFolderFile(file);
  if (content === undefined) throw new CloudhopError('INVALID_NAME', `Can't read ${file}.`);
  const aliases = parseFolderFile(content);
  const lines: string[] = [];
  for (const alias of Object.values(aliases)) {
    try {
      const status = await app.aliasStatus(alias);
      lines.push(
        `  ${bold(alias)}  ${status.label ?? status.target}  ${status.region ?? ''}${status.prod ? `  ${paint('red', 'PROD')}` : ''}`,
      );
    } catch {
      lines.push(
        `  ${bold(alias)}  ${paint('yellow', "you don't have this alias: it will be skipped")}`,
      );
    }
  }
  await trusted.trust(file, content);
  console.log(
    `${paint('green', '✔')} Trusted ${tilde(file)}. In ${tilde(dirname(file))} this shell uses:`,
  );
  console.log(lines.join('\n'));
}
