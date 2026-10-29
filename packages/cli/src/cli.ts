import { defaultConfigDir } from '@cloudhop/adapters-node';
import { CloudhopError, RESERVED_NAMES } from '@cloudhop/core';
import { serveMcp } from '@cloudhop/mcp';
import { addCommand, aliasCommand } from './commands/add';
import { agentCommand } from './commands/agent';
import {
  listCommand,
  loginCommand,
  providerCommand,
  regionCommand,
  removeCommand,
  statusCommand,
  syncCommand,
} from './commands/manage';
import { execCommand, proxyCommand } from './commands/run';
import { doctorCommand, setupCommand } from './commands/setup';
import { uiCommand } from './commands/ui';
import { createApp, createAssistants } from './container';
import { parseArgs } from './flags';
import { notify, PromptCancelled } from './ui';
import { startUpdateCheck } from './update-check';

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
  cloudhop ls [source] [--json]  List sources and their aliases
  cloudhop status [alias] [--json]
                                 Can it run now, or will it need a sign-in?
  cloudhop rm <name...> [--yes]  Remove aliases or sources (a source takes its aliases)
  cloudhop provider [ls|enable|disable] <provider>
  cloudhop doctor                Check (and install) the cloud CLIs
  cloudhop agent [status|install|update|remove] [--tools <list>] [--scope user|project] [--no-mcp]
                                 Teach Claude Code, Kiro, Copilot, Cursor or Codex to use cloudhop
  cloudhop mcp                   Model Context Protocol server for AI assistants (stdio)
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

  if (command === 'mcp') {
    // stdout belongs to the MCP protocol from here on: nothing else may print to it.
    await serveMcp({ app, version: __CLOUDHOP_VERSION__ });
    return 0;
  }

  const assistants = createAssistants(__CLOUDHOP_VERSION__);
  await refreshAssistantSkills(assistants, command);
  const finishUpdateCheck = startUpdateCheck(defaultConfigDir(), __CLOUDHOP_VERSION__);
  try {
    return await dispatch(app, assistants, command, args, local);
  } finally {
    await finishUpdateCheck();
  }
}

/** Skills installed by an older cloudhop are refreshed on the next run (user edits are kept). */
async function refreshAssistantSkills(
  assistants: ReturnType<typeof createAssistants>,
  command: string,
): Promise<void> {
  if (command === 'agent') return; // `cloudhop agent update` reports it itself.
  try {
    const { updated } = await assistants.update();
    if (updated.length > 0) {
      notify(`Updated the cloudhop skill for your AI assistants (${updated.length} file(s)).`);
    }
  } catch {
    // Never let this get in the way of the command the user ran.
  }
}

async function dispatch(
  app: ReturnType<typeof createApp>,
  assistants: ReturnType<typeof createAssistants>,
  command: string,
  args: string[],
  local: string[],
): Promise<number> {
  switch (command) {
    case 'setup':
      await setupCommand(app, assistants);
      return 0;
    case 'add':
      await addCommand(app, parseArgs(local));
      return 0;
    case 'alias':
      await aliasCommand(app, parseArgs(local));
      return 0;
    case 'status':
      await statusCommand(app, local);
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
      await listCommand(app, local);
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
    case 'agent':
      await agentCommand(assistants, local);
      return 0;
    case 'ui':
      await uiCommand(app, assistants, parseArgs(local));
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
