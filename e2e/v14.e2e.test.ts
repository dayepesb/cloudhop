import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAwsPath, sandbox } from './sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
let server: Server | undefined;
afterEach(async () => {
  server?.close();
  server = undefined;
  await box?.cleanup();
});

/** Something listening on a free port, standing in for the emulator. */
async function fakeEmulator(): Promise<number> {
  server = createServer((socket) => socket.end()).listen(0, '127.0.0.1');
  await new Promise((resolve) => server?.once('listening', resolve));
  return (server.address() as { port: number }).port;
}

describe('a local emulator', () => {
  it('is an alias like any other that only ever reaches the emulator', async () => {
    box = await sandbox({ seed: true });
    const path = await fakeAwsPath(box.root);
    const run = (args: string[]) =>
      box.run(args, { PATH: path, Path: path, CLOUDHOP_NO_UPDATE_CHECK: '1' });
    const port = await fakeEmulator();

    const add = await run([
      'add',
      'aws',
      'aws-emulator',
      '--port',
      String(port),
      '--name',
      'local',
    ]);
    expect(add.code).toBe(0);
    expect(add.stdout).toContain('added as alias "local"');
    const config = await box.readAwsConfig();
    expect(config).toContain(
      `[profile local]\nregion = us-east-1\nendpoint_url = https://127.0.0.1:${port}`,
    );
    expect(config).toContain('credential_process = cloudhop credentials local');
    expect(config).not.toMatch(/aws_secret_access_key = (?!test)/);

    const ls = await run(['ls']);
    expect(ls.stdout).toContain('emulator running');
    const hop = await run(['local', 's3', 'ls']);
    expect(hop.code).toBe(0);
    expect(JSON.parse(hop.stdout)).toMatchObject({ args: ['s3', 'ls'], profile: 'local' });

    // credential_process: this run's keys, read when the CLI asks for them.
    const folder = join(box.aws, 'emulator', String(port));
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, 'emulator_credentials'),
      '[default]\naws_access_key_id = EMULATORKEY\naws_secret_access_key = s3cret\n',
    );
    expect(JSON.parse((await run(['credentials', 'local'])).stdout)).toEqual({
      Version: 1,
      AccessKeyId: 'EMULATORKEY',
      SecretAccessKey: 's3cret',
    });
    const cloud = await run(['credentials', 'demo-dev']);
    expect(cloud.code).not.toBe(0);
    expect(cloud.stdout).toBe('');

    const exec = await run([
      'exec',
      'local',
      '--',
      process.execPath,
      '-e',
      'console.log(process.env.AWS_ENDPOINT_URL, process.env.AWS_ACCESS_KEY_ID, process.env.AWS_PROFILE ?? "-")',
    ]);
    expect(exec.stdout.trim()).toBe(`https://127.0.0.1:${port} EMULATORKEY -`);

    expect((await run(['prod', 'local'])).stderr).toContain("can't be production");
    expect((await run(['console', 'local'])).stderr).toContain('no web console');

    server?.close();
    await new Promise((resolve) => server?.once('close', resolve));
    const offline = await run(['local', 's3', 'ls']);
    expect(offline.code).not.toBe(0);
    expect(offline.stderr).toContain("isn't running");
    expect(offline.stderr).toContain(`aws-emulator -p ${port}`);
    const status = JSON.parse((await run(['status', 'local', '--json'])).stdout);
    expect(status.alias).toMatchObject({ local: true, session: 'offline', next: 'start-emulator' });
  });

  it('adds LocalStack with its fake keys and path-style buckets', async () => {
    box = await sandbox({ seed: true });
    const add = await box.run([
      'add',
      'aws',
      'localstack',
      '--endpoint',
      'http://localhost:4566',
      '--name',
      'localstack',
    ]);
    expect(add.code).toBe(0);
    const config = await box.readAwsConfig();
    expect(config).toContain('endpoint_url = http://localhost:4566');
    expect(config).toContain('aws_access_key_id = test');
    expect(config).toContain('s3 =\n  addressing_style = path');
    const aws = await box.run([
      'add',
      'aws',
      'localstack',
      '--endpoint',
      'https://s3.amazonaws.com',
    ]);
    expect(aws.code).not.toBe(0);
    expect(aws.stderr).toContain('not an AWS endpoint');
  });
});
