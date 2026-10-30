import { describe, expect, it } from 'vitest';
import { consoleDestination, federatedConsoleUrl, portalShortcutUrl } from './console';

const creds = {
  AWS_ACCESS_KEY_ID: 'AKIA1',
  AWS_SECRET_ACCESS_KEY: 'secret',
  AWS_SESSION_TOKEN: 'tok',
};

describe('console sign-in', () => {
  it('lands on the service home in the alias region, per partition', () => {
    expect(consoleDestination('eu-west-1', 's3')).toBe(
      'https://console.aws.amazon.com/s3/home?region=eu-west-1',
    );
    expect(consoleDestination('us-east-1')).toBe(
      'https://console.aws.amazon.com/console/home?region=us-east-1',
    );
    expect(consoleDestination('cn-north-1')).toMatch(/^https:\/\/console\.amazonaws\.cn\//);
  });

  it('exchanges credentials for a sign-in token by POST, never in the URL', async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      request = { url, init };
      return new Response(JSON.stringify({ SigninToken: 'SIGN' }), { status: 200 });
    }) as unknown as typeof fetch;
    const url = await federatedConsoleUrl(
      creds,
      consoleDestination('us-east-1', 's3'),
      'us-east-1',
      fetchFn,
    );

    expect(request?.url).toBe('https://signin.aws.amazon.com/federation');
    expect(request?.init.method).toBe('POST');
    const body = new URLSearchParams(String(request?.init.body));
    expect(body.get('Action')).toBe('getSigninToken');
    expect(JSON.parse(body.get('Session') ?? '{}')).toEqual({
      sessionId: 'AKIA1',
      sessionKey: 'secret',
      sessionToken: 'tok',
    });
    expect(body.has('SessionDuration')).toBe(false);

    const login = new URL(url ?? '');
    expect(login.searchParams.get('Action')).toBe('login');
    expect(login.searchParams.get('SigninToken')).toBe('SIGN');
    expect(login.searchParams.get('Destination')).toBe(
      'https://console.aws.amazon.com/s3/home?region=us-east-1',
    );
    expect(url).not.toContain('secret');
  });

  it('gives up quietly when AWS refuses the credentials', async () => {
    const refuse = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    expect(await federatedConsoleUrl(creds, 'x', 'us-east-1', refuse)).toBeUndefined();
    expect(await federatedConsoleUrl({}, 'x', 'us-east-1', refuse)).toBeUndefined();
  });

  it('builds the access portal shortcut as a fallback', () => {
    const url = new URL(
      portalShortcutUrl(
        'https://acme.awsapps.com/start/',
        '123',
        'Admin',
        'https://console.aws.amazon.com/',
      ),
    );
    expect(`${url.origin}${url.pathname}`).toBe('https://acme.awsapps.com/start/');
    const hash = new URLSearchParams(url.hash.replace('#/console?', ''));
    expect(hash.get('account_id')).toBe('123');
    expect(hash.get('role_name')).toBe('Admin');
  });
});

describe('portalShortcutUrl trailing slashes', () => {
  it('drops them, fast even on a very long run of slashes', () => {
    const started = Date.now();
    const url = portalShortcutUrl(
      `https://acme.awsapps.com/start${'/'.repeat(50_000)}`,
      '1',
      'R',
      'https://console.aws.amazon.com/',
    );
    expect(url.startsWith('https://acme.awsapps.com/start/#/console?')).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
