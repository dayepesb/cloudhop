import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessRunner, ResolvedAlias, Source } from '@cloudhop/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AwsProvider } from './aws-provider';
import { isListening, validateEndpoint } from './emulator';

const runner: ProcessRunner = {
  run: async () => ({ exitCode: 0, stderrTail: '' }),
  capture: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  probe: async () => ({ installed: true, version: '2.36.9' }),
};

const emulator: Source = {
  id: 'local',
  provider: 'aws',
  kind: 'aws-emulator',
  settings: { port: '9297', region: 'us-east-1' },
};
const localstack: Source = {
  id: 'localstack',
  provider: 'aws',
  kind: 'localstack',
  settings: { endpoint: 'http://localhost:4566', region: 'us-east-1' },
};

const resolved = (source: Source, name = source.id): ResolvedAlias => ({
  alias: { name, source: source.id, target: '000000000000' },
  source,
  target: { id: '000000000000', label: 'x', attributes: { accountId: '000000000000' } },
  region: 'us-east-1',
});

describe('local emulators', () => {
  let awsDir: string;
  let up: boolean;
  let provider: AwsProvider;

  beforeEach(async () => {
    awsDir = await mkdtemp(join(tmpdir(), 'cloudhop-emu-'));
    up = true;
    provider = new AwsProvider({ awsDir, runner, probe: async () => up });
  });

  it('is valid while the emulator listens and offline otherwise, with a way to start it', async () => {
    expect(await provider.sessionState(emulator)).toBe('valid');
    up = false;
    expect(await provider.sessionState(localstack)).toBe('offline');
    expect(provider.offlineHint(emulator)).toContain('aws-emulator -p 9297');
    expect(await provider.refreshSession(emulator)).toBe(false);
  });

  it('has one target, the emulator account, named after the source', async () => {
    const [target] = await provider.discoverTargets(emulator);
    expect(target).toMatchObject({
      id: '000000000000',
      label: 'AWS Emulator on port 9297',
      attributes: { accountName: 'local' },
    });
  });

  it('writes profiles that point at the emulator, never storing its keys', async () => {
    await provider.syncProfiles([emulator, localstack], [resolved(emulator), resolved(localstack)]);
    const config = await readFile(join(awsDir, 'config'), 'utf8');
    expect(config).toContain(`[profile local]
region = us-east-1
endpoint_url = https://127.0.0.1:9297
ca_bundle = ${join(awsDir, 'emulator', '9297', 'ca.pem')}
credential_process = cloudhop credentials local`);
    expect(config).toContain(`[profile localstack]
region = us-east-1
endpoint_url = http://localhost:4566
aws_access_key_id = test
aws_secret_access_key = test
s3 =
  addressing_style = path`);
  });

  it("reads this run's keys, or fake ones when the emulator vends none", async () => {
    expect(await provider.localCredentials(resolved(emulator))).toEqual({
      accessKeyId: 'test',
      secretAccessKey: 'test',
    });
    await mkdir(join(awsDir, 'emulator', '9297'), { recursive: true });
    await writeFile(
      join(awsDir, 'emulator', '9297', 'emulator_credentials'),
      '[default]\naws_access_key_id = EMULATORKEY\naws_secret_access_key = s3cret\n',
    );
    expect(await provider.localCredentials(resolved(emulator))).toEqual({
      accessKeyId: 'EMULATORKEY',
      secretAccessKey: 's3cret',
    });
  });

  it('gives other tools the endpoint, keys and certificate, never a cloud fallback', async () => {
    const env = await provider.processEnv(resolved(emulator), 'credentials');
    expect(env).toMatchObject({
      AWS_PROFILE: undefined,
      AWS_ENDPOINT_URL: 'https://127.0.0.1:9297',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CA_BUNDLE: join(awsDir, 'emulator', '9297', 'ca.pem'),
      AWS_REGION: 'us-east-1',
    });
    const cli = await provider.processEnv(resolved(localstack), 'cli');
    expect(cli).toMatchObject({ AWS_PROFILE: 'localstack', AWS_ACCESS_KEY_ID: undefined });
  });

  it('refuses AWS itself as an emulator endpoint', () => {
    expect(validateEndpoint('http://localhost:4566')).toBeUndefined();
    expect(validateEndpoint('http://host.docker.internal:4566/')).toBeUndefined();
    expect(validateEndpoint('https://s3.amazonaws.com')).toBeDefined();
    expect(validateEndpoint('localhost:4566')).toBeDefined();
  });

  it('knows whether something listens on a port', async () => {
    const server = createServer().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as { port: number };
    expect(await isListening('127.0.0.1', port)).toBe(true);
    server.close();
    await new Promise((resolve) => server.once('close', resolve));
    expect(await isListening('127.0.0.1', port)).toBe(false);
  });
});
