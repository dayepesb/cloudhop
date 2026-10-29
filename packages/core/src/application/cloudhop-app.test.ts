import { beforeEach, describe, expect, it } from 'vitest';
import { CloudhopError } from '../domain/errors';
import { type Config, emptyConfig, type SessionState, type Target } from '../domain/model';
import type { CloudProvider } from '../ports/cloud-provider';
import type { ConfigStore } from '../ports/config-store';
import type { CaptureResult, ProcessRunner, RunResult } from '../ports/system';
import { CloudhopApp } from './cloudhop-app';

class MemoryStore implements ConfigStore {
  config: Config = emptyConfig();
  targets = new Map<string, Target[]>();
  async load() {
    return structuredClone(this.config);
  }
  async save(config: Config) {
    this.config = structuredClone(config);
  }
  async loadTargets(id: string) {
    return this.targets.get(id) ?? [];
  }
  async saveTargets(id: string, targets: Target[]) {
    this.targets.set(id, targets);
  }
  async removeTargets(id: string) {
    this.targets.delete(id);
  }
}

const target = (id: string): Target => ({ id, label: id, attributes: {} });

class FakeProvider implements CloudProvider {
  readonly id = 'aws' as const;
  readonly displayName = 'AWS';
  readonly cli = { command: 'aws', displayName: 'AWS CLI', minVersion: '2.32.0' };
  readonly sourceKinds = [{ kind: 'sso', label: 'SSO', fields: [] }];
  readonly identityArgs = ['sts', 'get-caller-identity'];
  state: SessionState = 'valid';
  canRefresh = true;
  remoteTargets = [target('111/Admin'), target('222/ReadOnly')];
  logins = 0;
  refreshes = 0;
  synced: string[][] = [];

  async sessionState() {
    return this.state;
  }
  async refreshSession() {
    this.refreshes++;
    if (this.canRefresh) this.state = 'valid';
    return this.canRefresh;
  }
  loginError: Error | undefined;
  async login() {
    this.logins++;
    if (this.loginError) throw this.loginError;
    this.state = 'valid';
  }
  async discoverTargets() {
    return this.remoteTargets;
  }
  async syncProfiles(_sources: unknown, aliases: readonly { alias: { name: string } }[]) {
    this.synced.push(aliases.map((a) => a.alias.name));
  }
  async processEnv() {
    return { AWS_PROFILE: 'x' };
  }
  isSessionError(output: string) {
    return output.includes('ExpiredToken');
  }
}

class FakeRunner implements ProcessRunner {
  results: RunResult[] = [];
  calls: { command: string; args: readonly string[] }[] = [];
  installed = true;
  async run(command: string, args: readonly string[]) {
    this.calls.push({ command, args });
    return this.results.shift() ?? { exitCode: 0, stderrTail: '' };
  }
  captured: CaptureResult[] = [];
  async capture(command: string, args: readonly string[]) {
    this.calls.push({ command, args });
    return this.captured.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
  }
  async probe() {
    return this.installed ? { installed: true, version: '2.36.9' } : { installed: false };
  }
}

describe('CloudhopApp', () => {
  let store: MemoryStore;
  let provider: FakeProvider;
  let runner: FakeRunner;
  let app: CloudhopApp;
  let opened: string[];

  beforeEach(async () => {
    store = new MemoryStore();
    provider = new FakeProvider();
    runner = new FakeRunner();
    opened = [];
    app = new CloudhopApp({
      config: store,
      providers: [provider],
      runner,
      browser: { open: async (url) => void opened.push(url) },
      installer: { recipeFor: () => undefined, install: async () => false },
      notify: () => {},
    });
    await app.enableProvider('aws');
    await app.addSource({
      id: 'acme',
      provider: 'aws',
      kind: 'sso',
      settings: { region: 'us-east-1' },
    });
    await app.syncSource('acme');
    await app.addAliases([{ name: 'acme-prod', source: 'acme', target: '111/Admin' }]);
  });

  it('connects a new source by adding it and logging in', async () => {
    const report = await app.connectSource({
      id: 'other',
      provider: 'aws',
      kind: 'sso',
      settings: { region: 'us-east-1' },
    });
    expect(report.targets.length).toBeGreaterThan(0);
    expect((await app.config()).sources.map((s) => s.id)).toEqual(['acme', 'other']);
  });

  it('forgets a new source whose first login fails', async () => {
    provider.loginError = new Error('No such portal');
    await expect(
      app.connectSource({ id: 'typo', provider: 'aws', kind: 'sso', settings: {} }),
    ).rejects.toThrow('No such portal');
    expect((await app.config()).sources.map((s) => s.id)).toEqual(['acme']);
  });

  it('runs the provider CLI without logging in when the session is valid', async () => {
    const code = await app.runAsAlias('acme-prod', ['s3', 'ls']);
    expect(code).toBe(0);
    expect(runner.calls).toEqual([{ command: 'aws', args: ['s3', 'ls'] }]);
    expect(provider.logins).toBe(0);
  });

  it('refreshes silently when possible', async () => {
    provider.state = 'refreshable';
    await app.runAsAlias('acme-prod', ['s3', 'ls']);
    expect(provider.refreshes).toBe(1);
    expect(provider.logins).toBe(0);
  });

  it('logs in and resyncs when the session cannot be refreshed', async () => {
    provider.state = 'refreshable';
    provider.canRefresh = false;
    provider.remoteTargets = [...provider.remoteTargets, target('333/Admin')];
    await app.runAsAlias('acme-prod', ['s3', 'ls']);
    expect(provider.logins).toBe(1);
    expect(await app.listTargets('acme')).toHaveLength(3);
  });

  it('logs in and retries once when the CLI reports an expired session', async () => {
    runner.results = [
      { exitCode: 255, stderrTail: 'An error occurred (ExpiredToken)' },
      { exitCode: 0, stderrTail: '' },
    ];
    const code = await app.runAsAlias('acme-prod', ['s3', 'ls']);
    expect(code).toBe(0);
    expect(provider.logins).toBe(1);
    expect(runner.calls).toHaveLength(2);
  });

  it('does not retry on unrelated failures', async () => {
    runner.results = [{ exitCode: 1, stderrTail: 'NoSuchBucket' }];
    expect(await app.runAsAlias('acme-prod', ['s3', 'ls'])).toBe(1);
    expect(runner.calls).toHaveLength(1);
  });

  it('reports added, removed and orphaned targets on sync', async () => {
    provider.remoteTargets = [target('222/ReadOnly'), target('333/Admin')];
    const report = await app.syncSource('acme');
    expect(report.added.map((t) => t.id)).toEqual(['333/Admin']);
    expect(report.removed.map((t) => t.id)).toEqual(['111/Admin']);
    expect(report.orphanedAliases).toEqual(['acme-prod']);
  });

  it('rewrites provider profiles when aliases change', async () => {
    await app.addAliases([{ name: 'readonly', source: 'acme', target: '222/ReadOnly' }]);
    expect(provider.synced.at(-1)).toEqual(['acme-prod', 'readonly']);
    await app.removeAlias('acme-prod');
    expect(provider.synced.at(-1)).toEqual(['readonly']);
  });

  it('rejects reserved and duplicate alias names', async () => {
    await expect(
      app.addAliases([{ name: 'sync', source: 'acme', target: '111/Admin' }]),
    ).rejects.toThrow(CloudhopError);
    await expect(
      app.addAliases([{ name: 'acme-prod', source: 'acme', target: '111/Admin' }]),
    ).rejects.toMatchObject({ code: 'ALIAS_EXISTS' });
  });

  it('asks to install the CLI when it is missing', async () => {
    runner.installed = false;
    await expect(app.runAsAlias('acme-prod', ['s3', 'ls'])).rejects.toMatchObject({
      code: 'CLI_MISSING',
    });
  });

  it('changes an alias region and clears it when it matches the source', async () => {
    await app.setAliasRegion('acme-prod', 'us-east-2');
    expect((await app.resolveAlias('acme-prod')).region).toBe('us-east-2');
    expect((await app.config()).aliases[0]?.region).toBe('us-east-2');

    await app.setAliasRegion('acme-prod', 'us-east-1');
    expect((await app.config()).aliases[0]?.region).toBeUndefined();
    await expect(app.setAliasRegion('nope', 'us-east-1')).rejects.toMatchObject({
      code: 'ALIAS_NOT_FOUND',
    });
  });

  it('reports sources and aliases with their session state', async () => {
    provider.state = 'expired';
    const overview = await app.overview();
    expect(overview.sources).toEqual([
      expect.objectContaining({ id: 'acme', session: 'expired', next: 'browser-sign-in' }),
    ]);
    expect(overview.aliases[0]).toMatchObject({
      name: 'acme-prod',
      source: 'acme',
      target: '111/Admin',
      available: true,
      region: 'us-east-1',
      next: 'browser-sign-in',
    });
    expect(provider.logins).toBe(0);
    await expect(app.aliasStatus('nope')).rejects.toMatchObject({ code: 'ALIAS_NOT_FOUND' });
  });

  it('captures a command without ever opening the browser', async () => {
    runner.captured = [{ exitCode: 0, stdout: '{"Account":"111"}', stderr: '' }];
    const result = await app.captureAsAlias('acme-prod', ['sts', 'get-caller-identity']);
    expect(result.stdout).toContain('111');

    provider.state = 'expired';
    await expect(app.captureAsAlias('acme-prod', ['s3', 'ls'])).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
    });
    expect(provider.logins).toBe(0);
    expect(opened).toEqual([]);
  });

  it('reports LOGIN_REQUIRED when the CLI says the session expired', async () => {
    runner.captured = [{ exitCode: 255, stdout: '', stderr: 'ExpiredToken: renew it' }];
    await expect(app.captureAsAlias('acme-prod', ['s3', 'ls'])).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
    });
    expect(provider.logins).toBe(0);
  });

  it('applies a region override', async () => {
    const resolved = await app.resolveAlias('acme-prod', { region: 'eu-west-1' });
    expect(resolved.region).toBe('eu-west-1');
  });
});
