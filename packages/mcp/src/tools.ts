import { type CloudhopApp, CloudhopError } from '@cloudhop/core';

/** A tool as described in `tools/list`, plus the code that runs it. */
export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run(args: Record<string, unknown>): Promise<unknown>;
}

/** Caps what a command can send back, so one huge listing can't flood the assistant. */
const MAX_OUTPUT = 100_000;
const cap = (text: string) =>
  text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n… [truncated: ${text.length - MAX_OUTPUT} more characters. Narrow the command with --query or filters.]`
    : text;

/** On Windows the CLI may run through cmd.exe, where these characters would start new commands. */
const WINDOWS_SHELL_CHARS = /[&|<>^%!"\r\n]/;

const text = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new CloudhopError('INVALID_NAME', `"${key}" is required.`);
  }
  return value.trim();
};

const stringArray = (args: Record<string, unknown>, key: string): string[] => {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new CloudhopError('INVALID_NAME', `"${key}" must be an array of strings.`);
  }
  return value as string[];
};

const aliasInput = {
  alias: {
    type: 'string',
    description: 'The cloudhop alias to use, as listed by list_aliases. Ask the user which one.',
  },
};

/**
 * The MCP tools: read-only ones the assistant can call freely, `login` to
 * open the user's browser on purpose, and `run_cloud_cli`, which the client
 * should confirm with the user because it can change cloud resources.
 */
export function createTools(app: CloudhopApp): McpTool[] {
  return [
    {
      name: 'list_aliases',
      title: 'List cloudhop aliases',
      description:
        'Lists every cloudhop source (SSO portal or personal account) with its session state, and every alias: name, account/role label, region and whether a sign-in is needed. Call this first, then ask the user which alias to work with. Never contains secrets.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: () => app.overview(),
    },
    {
      name: 'alias_status',
      title: 'Check an alias',
      description:
        'Shows which account, role and region an alias points to and whether it can run now. `next` is "ready", "silent-renewal" (runs without asking), "browser-sign-in" (call login first, or ask the user to run `cloudhop login <source>`) or "unknown".',
      inputSchema: {
        type: 'object',
        properties: aliasInput,
        required: ['alias'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: (args) => app.aliasStatus(text(args, 'alias')),
    },
    {
      name: 'whoami',
      title: 'Who am I in this alias',
      description:
        'Asks the cloud who the alias really is (for AWS: `aws sts get-caller-identity`). Use it to confirm the account before doing anything important.',
      inputSchema: {
        type: 'object',
        properties: aliasInput,
        required: ['alias'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      run: async (args) => {
        const alias = text(args, 'alias');
        const result = await app.captureAsAlias(alias, await app.identityArgs(alias));
        return {
          alias,
          exitCode: result.exitCode,
          output: cap(result.stdout),
          errors: cap(result.stderr),
        };
      },
    },
    {
      name: 'login',
      title: 'Sign in to a source',
      description:
        "Opens the user's browser to sign in to a source (an SSO portal or a personal account) and waits up to 5 minutes for them to approve, then refreshes its accounts and roles. Tell the user to look at their browser before calling it. Only call it when alias_status says `browser-sign-in` or a tool returned LOGIN_REQUIRED.",
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'The source id, as shown in list_aliases.' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      run: async (args) => {
        const source = text(args, 'source');
        const report = await app.login(source);
        return { source, signedIn: true, targets: report.targets.length };
      },
    },
    {
      name: 'run_cloud_cli',
      title: 'Run the cloud CLI as an alias',
      description:
        'Runs the alias\' cloud CLI (`aws` for AWS aliases) with the alias\' account, role and region, like `hop <alias> <args>`. `args` are the CLI arguments without the program name and without --profile, e.g. ["s3", "ls"]. Returns stdout, stderr and the exit code. It can create, change or delete cloud resources: before any command that is not read-only, show the user the alias, account, region and exact command and get their explicit confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          ...aliasInput,
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'CLI arguments, e.g. ["ec2", "describe-instances", "--output", "json"].',
          },
          region: {
            type: 'string',
            description: "Optional region for this call only; defaults to the alias' region.",
          },
        },
        required: ['alias', 'args'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      run: async (args) => {
        const alias = text(args, 'alias');
        const cliArgs = stringArray(args, 'args');
        if (cliArgs.includes('--profile')) {
          throw new CloudhopError(
            'INVALID_NAME',
            'Do not pass --profile: the alias already chooses the account and role.',
          );
        }
        if (process.platform === 'win32' && cliArgs.some((a) => WINDOWS_SHELL_CHARS.test(a))) {
          throw new CloudhopError(
            'INVALID_NAME',
            'On Windows, arguments cannot contain & | < > ^ % ! " or line breaks.',
            'Ask the user to run this command in their terminal with hop instead.',
          );
        }
        const region =
          typeof args.region === 'string' && args.region.trim() ? args.region.trim() : undefined;
        const result = await app.captureAsAlias(alias, cliArgs, region ? { region } : {});
        return {
          alias,
          exitCode: result.exitCode,
          stdout: cap(result.stdout),
          stderr: cap(result.stderr),
        };
      },
    },
  ];
}
