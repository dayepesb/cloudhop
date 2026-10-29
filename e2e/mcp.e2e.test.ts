import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { CLI, fakeAwsPath, sandbox } from './sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
let client: Client;

/** Connects the official MCP SDK client to `cloudhop mcp`, as an AI assistant would. */
async function connect(extraEnv: Record<string, string> = {}) {
  box = await sandbox({ seed: true });
  const env = { ...box.env(), PATH: await fakeAwsPath(box.root), ...extraEnv } as Record<
    string,
    string
  >;
  client = new Client({ name: 'cloudhop-e2e', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [CLI, 'mcp'],
      env,
      stderr: 'pipe',
    }),
  );
  return client;
}

const json = (result: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((result.content as { type: string; text: string }[])[0]?.text ?? '{}');

afterEach(async () => {
  await client?.close();
  await box?.cleanup();
});

describe('cloudhop mcp', () => {
  it('introduces itself with instructions and safe tool annotations', async () => {
    await connect();
    expect(client.getServerVersion()?.name).toBe('cloudhop');
    expect(client.getInstructions()).toContain('ask which one to use');
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      'alias_status',
      'list_aliases',
      'login',
      'run_cloud_cli',
      'whoami',
    ]);
    expect(byName.list_aliases?.annotations?.readOnlyHint).toBe(true);
    expect(byName.run_cloud_cli?.annotations?.destructiveHint).toBe(true);
  });

  it('lists aliases with their session state', async () => {
    await connect();
    const overview = json(await client.callTool({ name: 'list_aliases', arguments: {} }));
    expect(overview.aliases[0]).toMatchObject({
      name: 'demo-dev',
      label: 'demo-account / Dev',
      next: 'ready',
    });
  });

  it('runs the CLI as the alias and returns its output', async () => {
    await connect();
    const who = json(await client.callTool({ name: 'whoami', arguments: { alias: 'demo-dev' } }));
    expect(JSON.parse(who.output)).toMatchObject({ Profile: 'demo-dev', Region: 'us-east-1' });

    const run = json(
      await client.callTool({
        name: 'run_cloud_cli',
        arguments: { alias: 'demo-dev', args: ['s3', 'ls'], region: 'eu-west-1' },
      }),
    );
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ args: ['s3', 'ls'], region: 'eu-west-1' });
  });

  it('refuses --profile and reports errors as tool results', async () => {
    await connect();
    const withProfile = await client.callTool({
      name: 'run_cloud_cli',
      arguments: { alias: 'demo-dev', args: ['s3', 'ls', '--profile', 'x'] },
    });
    expect(withProfile.isError).toBe(true);
    const unknown = await client.callTool({ name: 'alias_status', arguments: { alias: 'nope' } });
    expect(json(unknown)).toMatchObject({ error: 'ALIAS_NOT_FOUND' });
  });

  it('asks for a sign-in instead of opening a browser on its own', async () => {
    await connect({ FAKE_AWS_EXPIRED: '1' });
    const result = await client.callTool({
      name: 'run_cloud_cli',
      arguments: { alias: 'demo-dev', args: ['s3', 'ls'] },
    });
    expect(result.isError).toBe(true);
    expect(json(result)).toMatchObject({
      error: 'LOGIN_REQUIRED',
      hint: expect.stringContaining('cloudhop login demo'),
    });
  });
});
