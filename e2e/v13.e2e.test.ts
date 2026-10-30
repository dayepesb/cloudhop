import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLI, fakeAwsPath, sandbox } from './sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
afterEach(() => box?.cleanup());

async function withAws() {
  box = await sandbox({ seed: true });
  const path = await fakeAwsPath(box.root);
  const project = join(box.root, 'project');
  await mkdir(join(project, 'src'), { recursive: true });
  const run = (args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string) =>
    box.run(args, { PATH: path, Path: path, CLOUDHOP_NO_UPDATE_CHECK: '1', ...env }, cwd);
  return { run, path, project };
}

describe('cloudhop use, one alias per cloud', () => {
  it('sets the cloud-specific variables and turns one cloud off', async () => {
    const { run } = await withAws();
    const use = await run(['use', 'demo-dev', '--emit', 'bash']);
    expect(use.code).toBe(0);
    expect(use.stdout).toContain("export AWS_PROFILE='demo-dev'");
    expect(use.stdout).toContain("export CLOUDHOP_AWS_ALIAS='demo-dev'");
    expect(use.stdout).toMatch(/export CLOUDHOP_AWS_PROMPT='demo-dev( \(us-east-1\))?'/);
    expect(use.stdout).toContain('unset CLOUDHOP_AWS_PROD');

    const off = await run(['use', '--off', 'aws', '--emit', 'zsh'], {
      CLOUDHOP_AWS_ALIAS: 'demo-dev',
      CLOUDHOP_ALIAS: 'demo-dev',
    });
    expect(off.stdout).toContain('unset AWS_PROFILE');
    expect(off.stdout).toContain('unset CLOUDHOP_AWS_ALIAS');
    expect(off.stdout).toContain('unset CLOUDHOP_ALIAS');
    expect((await run(['use', '--off', 'oracle', '--emit', 'zsh'])).stderr).toContain(
      'Unknown cloud',
    );
  });
});

describe('the default alias', () => {
  it('is what a new terminal starts with, and production needs --yes', async () => {
    const { run } = await withAws();
    const set = await run(['use', 'demo-dev', '--default', '--emit', 'bash']);
    expect(set.code).toBe(0);
    expect(set.stderr).toContain('New terminals start with demo-dev');
    expect(JSON.parse((await run(['status', '--json'])).stdout).defaults).toEqual({
      aws: 'demo-dev',
    });
    expect((await run(['shell', 'zsh'])).stdout).toContain('_cloudhop_start=1');

    // A new terminal: no alias yet, nothing picked by hand.
    const start = await run(['use', '--emit', 'bash', '--leave']);
    expect(start.stdout).toContain("export AWS_PROFILE='demo-dev'");
    expect(start.stdout).toContain("export CLOUDHOP_RC_PROVIDERS='aws'");
    expect(start.stdout).toContain('unset CLOUDHOP_RC');
    // An alias picked by hand in this terminal stays.
    const picked = await run(['use', '--emit', 'bash', '--leave'], {
      CLOUDHOP_AWS_ALIAS: 'other',
    });
    expect(picked.stdout).not.toContain('AWS_PROFILE');

    await run(['prod', 'demo-dev']);
    const prod = await run(['use', 'demo-dev', '--default', '--emit', 'bash']);
    expect(prod.code).not.toBe(0);
    expect(prod.stderr).toContain('--default --yes');

    const clear = await run(['use', '--no-default', '--emit', 'bash']);
    expect(clear.stderr).toContain('no longer start with demo-dev');
    expect((await run(['shell', 'zsh'])).stdout).not.toContain('_cloudhop_start=1');
  });
});

describe('cloudhop status', () => {
  it('says which alias this terminal uses, in any terminal', async () => {
    const { run } = await withAws();
    expect((await run(['status'])).stdout).toContain('This terminal uses no alias');
    const using = await run(['status'], { CLOUDHOP_AWS_ALIAS: 'demo-dev' });
    expect(using.stdout).toContain('This terminal uses aws demo-dev');
    const json = JSON.parse(
      (await run(['status', '--json'], { CLOUDHOP_AWS_ALIAS: 'demo-dev' })).stdout,
    );
    expect(json.inUse).toEqual({ aws: 'demo-dev' });
  });
});

describe('.cloudhoprc folders', () => {
  it('ignores an untrusted file, applies it once allowed and asks again after a change', async () => {
    const { run, project } = await withAws();
    const file = join(project, '.cloudhoprc');
    await writeFile(file, 'aws: demo-dev\n');

    const untrusted = await run(['use', '--emit', 'bash', '--from', file]);
    expect(untrusted.code).toBe(0);
    expect(untrusted.stdout).not.toContain('AWS_PROFILE');
    expect(untrusted.stderr).toContain('cloudhop allow');

    const allow = await run(['allow'], {}, join(project, 'src'));
    expect(allow.code).toBe(0);
    expect(allow.stdout).toContain('demo-dev');

    const trusted = await run(['use', '--emit', 'bash', '--from', file]);
    expect(trusted.stdout).toContain("export AWS_PROFILE='demo-dev'");
    expect(trusted.stdout).toContain(`export CLOUDHOP_RC='${file}'`);
    expect(trusted.stdout).toContain("export CLOUDHOP_RC_PROVIDERS='aws'");

    const leave = await run(['use', '--emit', 'bash', '--leave'], {
      CLOUDHOP_RC: file,
      CLOUDHOP_RC_PROVIDERS: 'aws',
      CLOUDHOP_AWS_ALIAS: 'demo-dev',
    });
    expect(leave.stdout).toContain('unset AWS_PROFILE');
    expect(leave.stdout).toContain('unset CLOUDHOP_RC');

    await writeFile(file, 'aws: demo-dev\n# edited\n');
    expect((await run(['use', '--emit', 'bash', '--from', file])).stdout).not.toContain(
      'AWS_PROFILE',
    );
    await run(['deny', project]);
  });

  it('never breaks cd: bad files and unknown aliases are one-line notes', async () => {
    const { run, project } = await withAws();
    const file = join(project, '.cloudhoprc');
    await writeFile(file, 'aws: nope\n');
    await run(['allow', project]);
    const missing = await run(['use', '--emit', 'zsh', '--from', file]);
    expect(missing.code).toBe(0);
    expect(missing.stderr).toContain('not found');
    await writeFile(file, 'aws: $(touch /tmp/x)\n');
    const bad = await run(['use', '--emit', 'zsh', '--from', file]);
    expect(bad.code).toBe(0);
    expect(bad.stdout).not.toContain('touch');
  });

  it('--save writes and trusts the file; ls --json reports the folder and the alias in use', async () => {
    const { run, project } = await withAws();
    const save = await run(['use', 'demo-dev', '--save', '--emit', 'bash'], {}, project);
    expect(save.code).toBe(0);
    expect(await readFile(join(project, '.cloudhoprc'), 'utf8')).toContain('aws: demo-dev');

    const ls = await run(
      ['ls', '--json'],
      { CLOUDHOP_AWS_ALIAS: 'demo-dev' },
      join(project, 'src'),
    );
    const json = JSON.parse(ls.stdout);
    expect(json.inUse).toEqual({ aws: 'demo-dev' });
    expect(json.folder).toMatchObject({ aliases: { aws: 'demo-dev' }, trusted: true });
  });
});

/** The real integration in a real shell: cd switches, `aws` goes through cloudhop. */
const shells = ['zsh', 'bash'].filter(
  (shell) => process.platform !== 'win32' && spawnSync(shell, ['-c', 'true']).status === 0,
);

describe.each(shells)('%s integration', (shell) => {
  it('switches on cd, routes aws through cloudhop and leaves with the folder', async () => {
    const { path, project } = await withAws();
    const bin = join(box.root, 'cloudhop-bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'cloudhop'), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
    await chmod(join(bin, 'cloudhop'), 0o755);
    await writeFile(join(project, '.cloudhoprc'), 'aws: demo-dev\n');
    // bash only runs the hook before a prompt: a script calls it after cd.
    const cd = shell === 'bash' ? 'cd() { builtin cd "$@" && _cloudhop_cd; }' : '';
    const script = `
eval "$(cloudhop shell ${shell})"
${cd}
cd "${project}/src"; echo "untrusted=[$CLOUDHOP_AWS_ALIAS]"
cloudhop allow >/dev/null; echo "allowed=[$CLOUDHOP_AWS_ALIAS] prompt=[$(cloudhop_prompt)]"
aws s3 ls
cloudhop prod demo-dev >/dev/null
aws s3 rm s3://bucket/key; echo "prod-change-exit=$?"
cd "${box.root}"; echo "left=[$CLOUDHOP_AWS_ALIAS] profile=[$AWS_PROFILE]"
`;
    const result = spawnSync(
      shell,
      shell === 'zsh' ? ['-f', '-c', script] : ['--norc', '-c', script],
      {
        env: {
          ...box.env(),
          PATH: [bin, path].join(delimiter),
          CLOUDHOP_NO_UPDATE_CHECK: '1',
          AWS_PROFILE: '',
          CLOUDHOP_AWS_ALIAS: '',
        },
        encoding: 'utf8',
      },
    );
    expect(result.stdout).toContain('untrusted=[]');
    expect(result.stdout).toContain('allowed=[demo-dev] prompt=[aws:demo-dev]');
    expect(result.stdout).toContain('"profile":"demo-dev"');
    // Through cloudhop, so production asks: without a terminal it refuses.
    expect(result.stdout).toContain('prod-change-exit=1');
    expect(result.stderr).toContain('production');
    expect(result.stdout).toContain('left=[] profile=[]');
  });
});

describe.each(shells)('%s with a default alias', (shell) => {
  it('starts on it, gives way to a folder and comes back when leaving', async () => {
    const { path, project, run } = await withAws();
    const bin = join(box.root, 'cloudhop-bin');
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, 'cloudhop'), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
    await chmod(join(bin, 'cloudhop'), 0o755);
    await writeFile(join(project, '.cloudhoprc'), 'aws: demo-dev\n');
    expect((await run(['allow', project])).code).toBe(0);
    expect((await run(['use', 'demo-dev', '--default', '--emit', shell])).code).toBe(0);
    const cd = shell === 'bash' ? 'cd() { builtin cd "$@" && _cloudhop_cd; }' : '';
    const script = `
eval "$(cloudhop shell ${shell})"
${cd}
echo "start=[$CLOUDHOP_AWS_ALIAS] profile=[$AWS_PROFILE]"
cd "${project}/src"; echo "folder=[$CLOUDHOP_AWS_ALIAS] rc=[$CLOUDHOP_RC]"
cd "${box.root}"; echo "back=[$CLOUDHOP_AWS_ALIAS] rc=[$CLOUDHOP_RC]"
cloudhop use --off; echo "off=[$CLOUDHOP_AWS_ALIAS]"
`;
    const result = spawnSync(
      shell,
      shell === 'zsh' ? ['-f', '-c', script] : ['--norc', '-c', script],
      {
        cwd: box.root,
        env: {
          ...box.env(),
          PATH: [bin, path].join(delimiter),
          CLOUDHOP_NO_UPDATE_CHECK: '1',
          AWS_PROFILE: '',
          CLOUDHOP_AWS_ALIAS: '',
        },
        encoding: 'utf8',
      },
    );
    expect(result.stdout).toContain('start=[demo-dev] profile=[demo-dev]');
    expect(result.stdout).toContain(`folder=[demo-dev] rc=[${project}/.cloudhoprc]`);
    expect(result.stdout).toContain('back=[demo-dev] rc=[]');
    expect(result.stderr).toContain('Back to your default demo-dev');
    expect(result.stdout).toContain('off=[]');
  });
});

describe.skipIf(process.platform === 'win32')('cloudhop shell install', () => {
  it('adds the startup line and the Starship segments once, keeping a backup', async () => {
    box = await sandbox({ seed: true });
    const home = join(box.root, 'home');
    await mkdir(join(home, '.config'), { recursive: true });
    const starship = join(home, '.config', 'starship.toml');
    const original = 'format = """\n$directory\\\n$time\\\n"""\n\n[time]\ndisabled = false\n';
    await writeFile(starship, original);
    await writeFile(join(home, '.zshrc'), 'eval "$(starship init zsh)"\n');
    const env = { HOME: home, SHELL: '/bin/zsh', STARSHIP_CONFIG: '' };

    const first = await box.run(['shell', 'install', '--yes'], env);
    expect(first.code).toBe(0);
    expect(await readFile(join(home, '.zshrc'), 'utf8')).toContain('eval "$(cloudhop shell zsh)"');
    const patched = await readFile(starship, 'utf8');
    expect(patched).toContain('$time\\\n${env_var.cloudhop_aws}');
    expect(patched).toContain('[env_var.cloudhop_aws]');
    expect(await readFile(`${starship}.cloudhop-backup`, 'utf8')).toBe(original);

    const again = await box.run(['shell', 'install', '--yes'], env);
    expect(again.stdout).toContain('Already set up');
    expect(await readFile(starship, 'utf8')).toBe(patched);
  });
});
