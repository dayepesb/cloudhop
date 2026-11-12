import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import type { LocalCredentials, Source, Target } from '@cloudhop/core';

export const AWS_EMULATOR_KIND = 'aws-emulator';
export const LOCALSTACK_KIND = 'localstack';
export const LOCAL_KINDS: readonly string[] = [AWS_EMULATOR_KIND, LOCALSTACK_KIND];

/** Every emulator answers as this account. */
export const LOCAL_ACCOUNT = '000000000000';
export const DEFAULT_EMULATOR_PORT = '9297';
export const DEFAULT_LOCALSTACK_ENDPOINT = 'http://localhost:4566';

/** The keys LocalStack (and AWS Emulator started with `-a off`) accept: fake, not secrets. */
const FAKE_KEYS: LocalCredentials = { accessKeyId: 'test', secretAccessKey: 'test' };

export const validatePort = (value: string) =>
  /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) < 65536
    ? undefined
    : 'Use a port number like 9297.';

/** Any http(s) host, but never AWS itself: a local alias must not reach the cloud. */
export const validateEndpoint = (value: string) => {
  if (!/^https?:\/\/[^\s/?#]+\/?$/.test(value)) return 'Use a URL like http://localhost:4566.';
  if (/amazonaws\.com|\.aws(:|\/|$)/i.test(value)) return 'Use your emulator, not an AWS endpoint.';
  return undefined;
};

export interface Endpoint {
  url: string;
  host: string;
  port: number;
}

/** Where a local source's emulator listens. */
export function emulatorEndpoint(source: Source): Endpoint {
  if (source.kind === AWS_EMULATOR_KIND) {
    const port = Number(source.settings.port ?? DEFAULT_EMULATOR_PORT);
    return { url: `https://127.0.0.1:${port}`, host: '127.0.0.1', port };
  }
  const url = new URL(source.settings.endpoint ?? DEFAULT_LOCALSTACK_ENDPOINT);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return { url: url.origin, host: url.hostname, port };
}

/** The folder where AWS Emulator writes this run's keys and certificate, per port. */
export const emulatorDir = (awsDir: string, source: Source) =>
  join(awsDir, 'emulator', source.settings.port ?? DEFAULT_EMULATOR_PORT);

export function localTarget(source: Source): Target {
  const what =
    source.kind === AWS_EMULATOR_KIND
      ? `AWS Emulator on port ${emulatorEndpoint(source).port}`
      : `Emulator at ${emulatorEndpoint(source).url}`;
  // accountName: the alias suggested for it is the source's own name, like "local".
  return {
    id: LOCAL_ACCOUNT,
    label: what,
    attributes: { accountId: LOCAL_ACCOUNT, accountName: source.id },
  };
}

export function offlineHint(source: Source): string {
  if (source.kind === AWS_EMULATOR_KIND) {
    const { port } = emulatorEndpoint(source);
    return `Start AWS Emulator on port ${port} (\`aws-emulator -p ${port}\` on Linux, its Docker container on macOS and Windows), then try again.`;
  }
  return `Start it at ${emulatorEndpoint(source).url} (for LocalStack, \`localstack start\`), then try again.`;
}

/** True when something accepts connections there. Quick: an emulator is local. */
export function isListening(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * The keys to sign with. AWS Emulator vends new ones on every start, so they
 * are read from its folder each time; without that file (started with
 * `-a off`) any keys work. LocalStack takes `test`/`test`.
 */
export async function emulatorCredentials(
  awsDir: string,
  source: Source,
): Promise<LocalCredentials> {
  if (source.kind !== AWS_EMULATOR_KIND) return FAKE_KEYS;
  const text = await readFile(
    join(emulatorDir(awsDir, source), 'emulator_credentials'),
    'utf8',
  ).catch(() => undefined);
  if (text === undefined) return FAKE_KEYS;
  const value = (key: string) => text.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, 'm'))?.[1];
  const accessKeyId = value('aws_access_key_id');
  const secretAccessKey = value('aws_secret_access_key');
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : FAKE_KEYS;
}
