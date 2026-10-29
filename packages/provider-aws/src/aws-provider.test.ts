import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessRunner, Source } from '@cloudhop/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AwsProvider } from './aws-provider';
import { isoSeconds, tokenState, writeToken } from './sso/token-cache';

const runner: ProcessRunner = {
  run: async () => ({ exitCode: 0, stderrTail: '' }),
  capture: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  probe: async () => ({ installed: true, version: '2.36.9' }),
};

const acme: Source = {
  id: 'acme',
  provider: 'aws',
  kind: 'sso',
  settings: { startUrl: 'https://acme.awsapps.com/start', region: 'us-east-1' },
};

/** Serves the portal API from fixtures and records the requested URLs. */
function fakePortal(requests: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url.pathname + url.search);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === '/assignment/accounts') {
      return url.searchParams.get('next_token')
        ? json({ accountList: [{ accountId: '222', accountName: 'Acme Dev' }] })
        : json({
            accountList: [{ accountId: '111', accountName: 'Acme Prod' }],
            nextToken: 'page2',
          });
    }
    if (url.pathname === '/assignment/roles') {
      const accountId = url.searchParams.get('account_id');
      return json({ roleList: [{ accountId, roleName: 'AdminAccess' }] });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

describe('AwsProvider', () => {
  let awsDir: string;
  let requests: string[];
  let provider: AwsProvider;

  beforeEach(async () => {
    awsDir = await mkdtemp(join(tmpdir(), 'cloudhop-aws-'));
    requests = [];
    provider = new AwsProvider({ awsDir, runner, fetchFn: fakePortal(requests) });
  });

  it('is expired until a token is cached', async () => {
    expect(await provider.sessionState(acme)).toBe('expired');
    await writeToken(awsDir, 'cloudhop-acme', {
      startUrl: acme.settings.startUrl ?? '',
      region: 'us-east-1',
      accessToken: 'token',
      expiresAt: isoSeconds(Date.now() + 3600_000),
    });
    expect(await provider.sessionState(acme)).toBe('valid');
  });

  it('discovers every account and role across pages', async () => {
    await writeToken(awsDir, 'cloudhop-acme', {
      startUrl: 'x',
      region: 'us-east-1',
      accessToken: 'token',
      expiresAt: isoSeconds(Date.now() + 3600_000),
    });
    const targets = await provider.discoverTargets(acme);
    expect(targets.map((t) => t.label)).toEqual([
      'Acme Dev / AdminAccess',
      'Acme Prod / AdminAccess',
    ]);
    expect(targets[0]?.attributes).toEqual({
      accountId: '222',
      accountName: 'Acme Dev',
      roleName: 'AdminAccess',
    });
  });

  it('writes sso-session and profiles to ~/.aws/config', async () => {
    const target = {
      id: '111/AdminAccess',
      label: '',
      attributes: { accountId: '111', roleName: 'AdminAccess' },
    };
    await provider.syncProfiles(
      [acme],
      [
        {
          alias: { name: 'acme-prod', source: 'acme', target: target.id },
          source: acme,
          target,
          region: 'us-east-2',
        },
      ],
    );
    const config = await readFile(join(awsDir, 'config'), 'utf8');
    expect(config).toContain(
      '[sso-session cloudhop-acme]\nsso_start_url = https://acme.awsapps.com/start',
    );
    expect(config).toContain(
      '[profile acme-prod]\nsso_session = cloudhop-acme\nsso_account_id = 111',
    );
    expect(config).toContain('region = us-east-2');
  });

  it('points the CLI at the profile and drops inherited static keys', async () => {
    const env = await provider.processEnv(
      {
        alias: { name: 'acme-prod', source: 'acme', target: 't' },
        source: acme,
        target: undefined,
        region: 'eu-west-1',
      },
      'cli',
    );
    expect(env).toMatchObject({
      AWS_PROFILE: 'acme-prod',
      AWS_REGION: 'eu-west-1',
      AWS_ACCESS_KEY_ID: undefined,
    });
  });

  it('recognises expired-session errors', () => {
    expect(provider.isSessionError('An error occurred (ExpiredToken) when calling')).toBe(true);
    expect(provider.isSessionError('Error when retrieving token from sso: Token has expired')).toBe(
      true,
    );
    expect(provider.isSessionError('An error occurred (NoSuchBucket)')).toBe(false);
  });
});

describe('tokenState', () => {
  const base = { startUrl: 'x', region: 'us-east-1', accessToken: 'a' };
  const past = isoSeconds(Date.now() - 1000);

  it('is refreshable with a refresh token and a valid registration', () => {
    expect(
      tokenState({
        ...base,
        expiresAt: past,
        refreshToken: 'r',
        clientId: 'c',
        clientSecret: 's',
        registrationExpiresAt: isoSeconds(Date.now() + 86_400_000),
      }),
    ).toBe('refreshable');
  });

  it('is expired without a refresh token', () => {
    expect(tokenState({ ...base, expiresAt: past })).toBe('expired');
  });
});

describe('region validation', () => {
  const provider = new AwsProvider({ awsDir: '/tmp/none', runner: {} as never });
  const validate = provider.sourceKinds[0]?.fields.find((f) => f.key === 'region')?.validate;

  it('accepts real region shapes', () => {
    for (const region of ['us-east-1', 'ap-southeast-2', 'eu-central-1', 'us-gov-west-1']) {
      expect(validate?.(region)).toBeUndefined();
    }
  });

  it('rejects typos', () => {
    for (const region of ['us-wst-1', 'useast1', 'US-EAST-1', 'us-east']) {
      expect(validate?.(region)).toBeTypeOf('string');
    }
  });
});
