import { CloudhopError, RESERVED_NAMES } from '@cloudhop/core';
import { addCommand, aliasCommand } from './commands/add';
import {
  listCommand,
  loginCommand,
  providerCommand,
  regionCommand,
  removeCommand,
  syncCommand,
} from './commands/manage';
import { execCommand, proxyCommand } from './commands/run';
import { doctorCommand, setupCommand } from './commands/setup';
import { uiCommand } from './commands/ui';
import { createApp } from './container';
import { parseArgs } from './flags';
import { PromptCancelled } from './ui';

declare const __CLOUDHOP_VERSION__: string;

const HELP = `cloudhop ${__CLOUDHOP_VERSION__}
Hop between cloud accounts, roles and regions with one command.

Usage
  hop <alias> [args...]          Run the cloud CLI as <alias> (no args: who am I)
  cloudhop exec <alias> [--region <r>] -- <cmd...>
                                 Run any tool with the alias' temporary credentials

Setup
  cloudhop setup                 Choose your clouds and add your first account
  cloudhop add                   Add an SSO portal or a personal account
  cloudhop add aws sso --start-url <url> [--region <r>] [--name <id>]
  cloudhop add aws console-login [--region <r>] [--name <id>]
  cloudhop alias [source]        Create more aliases from a source
  cloudhop alias <source> --list | --target <id> [--name <alias>] [--region <r>]
  cloudhop region <alias> [region]
                                 Change the region an alias runs in
  cloudhop login [source]        Log in again and refresh its accounts
  cloudhop sync [source]         Refresh the accounts/roles you have access to
  cloudhop ls [source]           List sources and their aliases
  cloudhop rm <name...> [--yes]  Remove aliases or sources (a source takes its aliases)
  cloudhop provider [ls|enable|disable] <provider>
  cloudhop doctor                Check (and install) the cloud CLIs
  cloudhop ui [--port <n>] [--no-open]
                                 Manage sources and aliases in a local web page

Options
  --device-code                  Log in with a code instead of the browser redirect
  -v, --version                  Show the version

Docs: https://dayepesb.github.io/cloudhop/`;

/** Strips cloudhop's own flags; everything else is passed through untouched. */
function takeGlobalFlags(argv: string[]): string[] {
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg === '--device-code') process.env.CLOUDHOP_DEVICE_CODE = '1';
    else rest.push(arg);
  }
  return rest;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(__CLOUDHOP_VERSION__);
    return 0;
  }

  const app = createApp();
  // Only the first argument belongs to cloudhop when proxying: `hop prod s3 ls --device-code` is aws' business.
  const local = RESERVED_NAMES.has(command) ? takeGlobalFlags(args) : args;

  switch (command) {
    case 'setup':
      await setupCommand(app);
      return 0;
    case 'add':
      await addCommand(app, parseArgs(local));
      return 0;
    case 'alias':
      await aliasCommand(app, parseArgs(local));
      return 0;
    case 'region':
      await regionCommand(app, local);
      return 0;
    case 'login':
      await loginCommand(app, local[0]);
      return 0;
    case 'sync':
      await syncCommand(app, local[0]);
      return 0;
    case 'ls':
    case 'list':
      await listCommand(app, local[0]);
      return 0;
    case 'rm':
    case 'remove':
      await removeCommand(app, local);
      return 0;
    case 'provider':
      await providerCommand(app, local);
      return 0;
    case 'doctor':
      await doctorCommand(app);
      return 0;
    case 'exec':
      return execCommand(app, local);
    case 'ui':
      await uiCommand(app, parseArgs(local));
      return 0;
    default:
      return proxyCommand(app, command, args);
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof PromptCancelled) {
      console.error('Cancelled.');
      process.exitCode = 130;
      return;
    }
    if (error instanceof CloudhopError) {
      console.error(`✖ ${error.message}`);
      if (error.hint) console.error(`  ${error.hint}`);
    } else {
      console.error(`✖ ${(error as Error).message ?? error}`);
      if (process.env.CLOUDHOP_DEBUG) console.error(error);
    }
    process.exitCode = 1;
  });
