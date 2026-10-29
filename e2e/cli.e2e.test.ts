import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PATH_WITHOUT_AWS, sandbox } from './sandbox';

const { version } = JSON.parse(
  readFileSync(new URL('../packages/cli/package.json', import.meta.url), 'utf8'),
);

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
afterEach(() => box?.cleanup());

describe('cloudhop CLI (bundled)', () => {
  it('prints its version and help', async () => {
    box = await sandbox();
    expect((await box.run(['--version'])).stdout.trim()).toBe(version);
    const help = await box.run(['--help']);
    expect(help.code).toBe(0);
    for (const command of [
      'setup',
      'add',
      'alias',
      'region',
      'status',
      'rm',
      'ui',
      'agent',
      'mcp',
      'exec',
    ]) {
      expect(help.stdout).toContain(`cloudhop ${command}`);
    }
  });

  it('explains how to script setup when there is no terminal', async () => {
    box = await sandbox();
    const result = await box.run(['setup']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not an interactive terminal');
    expect(result.stderr).toContain('cloudhop add aws sso');
  });

  it('starts empty and enables providers', async () => {
    box = await sandbox();
    expect((await box.run(['ls'])).stdout).toContain('Nothing here yet');
    const enable = await box.run(['provider', 'enable', 'aws']);
    expect(enable.code).toBe(0);
    expect(await box.readConfig()).toContain('- aws');
  });

  it('validates flags before touching anything', async () => {
    box = await sandbox();
    await box.run(['provider', 'enable', 'aws']);
    const missing = await box.run(['add', 'aws', 'sso', '--name', 'acme']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('--start-url');

    const badRegion = await box.run([
      'add',
      'aws',
      'sso',
      '--start-url',
      'https://acme.awsapps.com/start',
      '--region',
      'us-wst-1',
    ]);
    expect(badRegion.code).toBe(1);
    expect(badRegion.stderr).toContain('--region');
    expect(await box.readConfig()).not.toContain('acme');
  });

  it('prints sources and aliases as JSON, and the status of an alias', async () => {
    box = await sandbox({ seed: true });
    const ls = JSON.parse((await box.run(['ls', '--json'])).stdout);
    expect(ls.version).toBe(1);
    expect(ls.aliases[0]).toMatchObject({
      name: 'demo-dev',
      label: 'demo-account / Dev',
      next: 'ready',
    });
    const status = JSON.parse((await box.run(['status', 'demo-dev', '--json'])).stdout);
    expect(status.alias).toMatchObject({ source: 'demo', region: 'us-east-1', session: 'valid' });
    expect((await box.run(['status', 'demo-dev'])).stdout).toContain('ready to run');
  });

  it('lists sources with their aliases grouped', async () => {
    box = await sandbox({ seed: true });
    const ls = await box.run(['ls']);
    expect(ls.code).toBe(0);
    expect(ls.stdout).toMatch(/demo\s+AWS · https:\/\/demo\.awsapps\.com\/start/);
    expect(ls.stdout).toMatch(/demo-dev\s+us-east-1\s+demo-account \/ Dev/);
    expect((await box.run(['ls', 'nope'])).code).toBe(1);
  });

  it('creates an alias and writes its AWS profile', async () => {
    box = await sandbox({ seed: true });
    const list = await box.run(['alias', 'demo', '--list']);
    expect(list.stdout).toContain('222222222222/Admin');

    const created = await box.run([
      'alias',
      'demo',
      '--target',
      '222222222222/Admin',
      '--name',
      'other',
      '--region',
      'eu-west-1',
    ]);
    expect(created.code).toBe(0);
    const awsConfig = await box.readAwsConfig();
    expect(awsConfig).toContain('[sso-session cloudhop-demo]');
    expect(awsConfig).toMatch(
      /\[profile other\]\nsso_session = cloudhop-demo\nsso_account_id = 222222222222\nsso_role_name = Admin\nregion = eu-west-1/,
    );
  });

  it('refuses to overwrite a hand-written profile', async () => {
    box = await sandbox({ seed: true });
    await box.writeAwsConfig('[profile mine]\nregion = us-east-1\n');
    const result = await box.run([
      'alias',
      'demo',
      '--target',
      '222222222222/Admin',
      '--name',
      'mine',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('outside cloudhop');
    expect(await box.readAwsConfig()).toBe('[profile mine]\nregion = us-east-1\n');
  });

  it('changes an alias region and rejects typos', async () => {
    box = await sandbox({ seed: true });
    expect((await box.run(['region', 'demo-dev', 'us-wst-1'])).code).toBe(1);
    const changed = await box.run(['region', 'demo-dev', 'us-east-2']);
    expect(changed.stdout).toContain('us-east-1 → us-east-2');
    expect(await box.readAwsConfig()).toMatch(/\[profile demo-dev\][^[]*region = us-east-2/);
  });

  it('removes aliases, and sources only with confirmation', async () => {
    box = await sandbox({ seed: true });
    const needsYes = await box.run(['rm', 'demo']);
    expect(needsYes.code).toBe(1);
    expect(needsYes.stderr).toContain('--yes');

    expect((await box.run(['rm', 'demo-dev'])).code).toBe(0);
    expect(await box.readConfig()).not.toContain('demo-dev');
    expect((await box.run(['rm', 'demo', '--yes'])).code).toBe(0);
    expect(await box.readConfig()).not.toContain('demo:');
    expect(await box.readAwsConfig()).not.toContain('cloudhop-demo');
  });

  it('reports unknown aliases and a missing AWS CLI clearly', async () => {
    box = await sandbox({ seed: true });
    const unknown = await box.run(['nope', 's3', 'ls']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toMatch(/nope/);

    const noCli = await box.run(['demo-dev', 's3', 'ls'], {
      PATH: PATH_WITHOUT_AWS,
      Path: PATH_WITHOUT_AWS,
    });
    expect(noCli.code).toBe(1);
    expect(noCli.stderr).toContain('AWS CLI');
  });
});
