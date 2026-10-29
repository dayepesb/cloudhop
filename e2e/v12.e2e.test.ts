import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAwsPath, sandbox } from './sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
afterEach(() => box?.cleanup());

/** A seeded sandbox whose `aws` is the fake one, so commands really run (offline). */
async function withAws() {
  box = await sandbox({ seed: true });
  const path = await fakeAwsPath(box.root);
  return (args: string[], env: NodeJS.ProcessEnv = {}) =>
    box.run(args, { PATH: path, Path: path, CLOUDHOP_NO_UPDATE_CHECK: '1', ...env });
}

describe('production protection', () => {
  it('runs reads, and refuses changes without a person to confirm', async () => {
    const run = await withAws();
    expect((await run(['prod', 'demo-dev'])).stdout).toContain('PROD');
    expect((await run(['ls'])).stdout).toMatch(/demo-dev.*PROD/);

    const read = await run(['demo-dev', 's3', 'ls']);
    expect(read.code).toBe(0);

    const change = await run(['demo-dev', 's3', 'rm', 's3://bucket/key']);
    expect(change.code).toBe(1);
    expect(change.stderr).toContain('is production');
    expect(change.stdout).toBe('');

    const approved = await run(['demo-dev', 's3', 'rm', 's3://bucket/key'], {
      CLOUDHOP_CONFIRM_PROD: '1',
    });
    expect(approved.code).toBe(0);
    expect(JSON.parse(approved.stdout).args).toEqual(['s3', 'rm', 's3://bucket/key']);

    expect((await run(['exec', 'demo-dev', '--', 'node', '-e', '1'])).code).toBe(1);
    await run(['prod', 'demo-dev', '--off']);
    expect((await run(['demo-dev', 's3', 'rm', 's3://bucket/key'])).code).toBe(0);
  });
});

describe('renaming', () => {
  it('renames the alias and its AWS profile', async () => {
    const run = await withAws();
    expect((await run(['mv', 'demo-dev', 'demo-development'])).code).toBe(0);
    expect(await box.readConfig()).toContain('demo-development:');
    expect(await box.readAwsConfig()).toContain('[profile demo-development]');
    expect(await box.readAwsConfig()).not.toContain('[profile demo-dev]');
    expect((await run(['mv', 'demo-development', 'ls'])).code).toBe(1);
  });
});

describe('cloudhop each', () => {
  it('runs in every selected alias, labelled, and needs --yes without a terminal', async () => {
    const run = await withAws();
    await run(['alias', 'demo', '--target', '222222222222/Admin', '--name', 'demo-admin']);
    expect((await run(['each', 'demo-*', '--', 's3', 'ls'])).code).toBe(1);

    const result = await run(['each', 'demo-dev,demo-admin', '--yes', '--', 's3', 'ls']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/\[demo-dev\]\s+\{/);
    expect(result.stdout).toMatch(/\[demo-admin\]\s+\{/);

    const json = JSON.parse(
      (await run(['each', '/^demo-/', '--yes', '--json', '--', 's3', 'ls'])).stdout,
    );
    expect(json.results.map((r: { alias: string }) => r.alias).sort()).toEqual([
      'demo-admin',
      'demo-dev',
    ]);
  });
});

describe('team setup', () => {
  it('exports portals and aliases, and imports them where access exists', async () => {
    const run = await withAws();
    const exported = await run(['team', 'export']);
    expect(exported.stdout).toContain('version: 1');
    expect(exported.stdout).toContain('https://demo.awsapps.com/start');

    const file = join(box.root, 'team.yaml');
    await writeFile(
      file,
      `version: 1
sources:
  demo-team:
    provider: aws
    kind: sso
    settings: { startUrl: "https://demo.awsapps.com/start", region: us-east-1 }
aliases:
  demo-dev: { source: demo-team, target: 111111111111/Dev }
  team-admin: { source: demo-team, target: 222222222222/Admin, prod: true }
  team-ghost: { source: demo-team, target: 999999999999/Nope }
`,
    );
    expect((await run(['team', 'import', file])).code).toBe(1); // needs --yes without a terminal
    const imported = await run(['team', 'import', file, '--yes']);
    expect(imported.code).toBe(0);
    expect(imported.stdout).toContain('Created 1 alias(es): team-admin');
    expect(imported.stdout).toContain("don't have access to their account/role: team-ghost");
    expect(await box.readConfig()).toMatch(/team-admin:\n\s+source: demo\n[\s\S]*prod: true/);
  });

  it('rejects files that are not team setups', async () => {
    const run = await withAws();
    const file = join(box.root, 'bad.yaml');
    await writeFile(file, 'version: 2\n');
    const result = await run(['team', 'import', file, '--yes']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Not a cloudhop team file');
  });
});

describe('shell integration', () => {
  it('prints shell code for use, completion words and per-shell scripts', async () => {
    const run = await withAws();
    const use = await run(['use', 'demo-dev', '--emit', 'bash']);
    expect(use.stdout).toContain("export AWS_PROFILE='demo-dev'");
    expect(use.stdout).toContain("export CLOUDHOP_ALIAS='demo-dev'");
    expect(use.stdout).toContain('unset AWS_ACCESS_KEY_ID');
    expect((await run(['use', 'demo-dev', '--emit', 'fish'])).stdout).toContain(
      "set -gx AWS_PROFILE 'demo-dev'",
    );
    expect((await run(['use', 'demo-dev'])).code).toBe(1);

    expect((await run(['__complete', 'aliases'])).stdout.trim()).toBe('demo-dev');
    expect((await run(['__complete', 'commands'])).stdout).toContain('console');
    for (const shell of ['zsh', 'bash', 'fish', 'pwsh']) {
      expect((await run(['shell', shell])).stdout).toContain('cloudhop_prompt');
    }
  });
});

describe('suggested names', () => {
  it('suggests short alias names', async () => {
    const run = await withAws();
    const created = await run(['alias', 'demo', '--target', '222222222222/Admin']);
    expect(created.stdout).toContain('Alias "other-account"');
    expect(await readFile(join(box.home, 'config.yaml'), 'utf8')).toContain('other-account:');
  });
});
