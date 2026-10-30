import type { CloudhopApp } from '@cloudhop/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startUiServer, type UiServer } from './server';

/** Just enough of CloudhopApp for the state endpoint and a region change. */
function stubApp() {
  const calls: string[] = [];
  const source = { id: 'acme', provider: 'aws', kind: 'sso', settings: { region: 'us-east-1' } };
  const provider = {
    id: 'aws',
    displayName: 'AWS',
    sourceKinds: [
      {
        kind: 'sso',
        label: 'SSO',
        fields: [
          {
            key: 'region',
            label: 'Region',
            validate: (v: string) => (/^[a-z]{2}-[a-z]+-\d$/.test(v) ? undefined : 'Bad region.'),
          },
        ],
      },
    ],
    sessionState: async () => 'valid',
  };
  const app = {
    config: async () => ({ providers: ['aws'], sources: [source], aliases: [] }),
    listAliases: async () => [
      { alias: { name: 'dev', source: 'acme', target: '1/Dev' }, source, region: 'us-east-1' },
    ],
    availableProviders: () => [provider],
    provider: () => provider,
    resolveAlias: async () => ({
      alias: { name: 'dev', source: 'acme', target: '1/Dev', default: true },
      source,
      region: 'us-east-1',
    }),
    setDefaultAlias: async (name: string) => {
      calls.push(`default ${name}`);
      return 'aws';
    },
    clearDefaultAlias: async (provider: string) => {
      calls.push(`no default ${provider}`);
      return ['dev'];
    },
    setAliasRegion: async (name: string, region: string) => {
      calls.push(`${name}=${region}`);
    },
    removeAlias: async (name: string) => {
      calls.push(`rm alias ${name}`);
    },
    removeSource: async (id: string) => {
      calls.push(`rm source ${id}`);
    },
  };
  return { app: app as unknown as CloudhopApp, calls };
}

describe('UI server', () => {
  let server: UiServer;
  let base: string;
  let token: string;
  let calls: string[];

  beforeEach(async () => {
    const stub = stubApp();
    calls = stub.calls;
    server = await startUiServer({ app: stub.app });
    const url = new URL(server.url);
    base = url.origin;
    token = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
  });

  afterEach(() => server.close());

  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'x-cloudhop-token': token, ...(init.headers as Record<string, string>) },
    });

  it('listens on loopback with the token in the fragment', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#token=[\w-]{32}$/);
  });

  it('serves the page and script with a strict CSP', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await page.text()).toContain('<script type="module" src="/app.js">');
    expect((await fetch(`${base}/app.js`)).headers.get('content-type')).toContain('javascript');
  });

  it('rejects API calls without the right token', async () => {
    expect((await fetch(`${base}/api/state`)).status).toBe(401);
    const wrong = await fetch(`${base}/api/state`, { headers: { 'x-cloudhop-token': 'nope' } });
    expect(wrong.status).toBe(401);
  });

  it('rejects other origins', async () => {
    const response = await call('/api/state', { headers: { origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
  });

  it('returns state without secrets', async () => {
    const response = await call('/api/state');
    expect(response.status).toBe(200);
    const state = (await response.json()) as {
      sources: unknown[];
      aliases: unknown[];
    };
    expect(state.sources[0]).toMatchObject({ id: 'acme', session: 'valid' });
    expect(state.aliases[0]).toMatchObject({ name: 'dev', region: 'us-east-1', missing: true });
    expect(JSON.stringify(state)).not.toMatch(/token|secret/i);
  });

  it('validates and changes an alias region', async () => {
    const patch = (region: string) =>
      call('/api/aliases/dev', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ region }),
      });
    expect((await patch('us-wst')).status).toBe(400);
    expect((await patch('us-east-2')).status).toBe(200);
    expect(calls).toEqual(['dev=us-east-2']);
  });

  it('makes an alias the default of new terminals, and back', async () => {
    const patch = (value: boolean) =>
      call('/api/aliases/dev', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ default: value }),
      });
    expect((await patch(true)).status).toBe(200);
    expect((await patch(false)).status).toBe(200);
    expect(calls).toEqual(['default dev', 'no default aws']);
  });

  it('accepts actions without a body, like remove', async () => {
    expect((await call('/api/aliases/dev', { method: 'DELETE' })).status).toBe(200);
    expect((await call('/api/sources/acme', { method: 'DELETE' })).status).toBe(200);
    expect(calls).toEqual(['rm alias dev', 'rm source acme']);
  });

  it('requires JSON for writes', async () => {
    const response = await call('/api/aliases/dev', { method: 'PATCH', body: 'region=x' });
    expect(response.status).toBe(415);
  });
});
