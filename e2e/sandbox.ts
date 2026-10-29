import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The bundled CLI exactly as npm ships it. Build it first with `pnpm build`. */
export const CLI = fileURLToPath(new URL('../packages/cli/dist/cli.js', import.meta.url));

export const SEED_CONFIG = `providers:
  - aws
sources:
  demo:
    provider: aws
    kind: sso
    settings:
      startUrl: https://demo.awsapps.com/start
      region: us-east-1
aliases:
  demo-dev:
    source: demo
    target: 111111111111/Dev
`;

export const SEED_TARGETS = {
  demo: [
    {
      id: '111111111111/Dev',
      label: 'demo-account / Dev',
      attributes: { accountId: '111111111111', accountName: 'demo-account', roleName: 'Dev' },
    },
    {
      id: '222222222222/Admin',
      label: 'other-account / Admin',
      attributes: { accountId: '222222222222', accountName: 'other-account', roleName: 'Admin' },
    },
  ],
};

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * An isolated cloudhop: its own config dir and ~/.aws, so tests never touch
 * the real ones and never reach the network.
 */
export async function sandbox(options: { seed?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cloudhop-e2e-'));
  const home = join(root, 'cloudhop');
  const aws = join(root, 'aws');
  await mkdir(home, { recursive: true });
  await mkdir(aws, { recursive: true });
  if (options.seed) {
    await writeFile(join(home, 'config.yaml'), SEED_CONFIG);
    await writeFile(join(home, 'targets.json'), JSON.stringify(SEED_TARGETS));
    // A valid-looking SSO session, so commands skip the login (and the network).
    const cache = join(aws, 'sso', 'cache');
    await mkdir(cache, { recursive: true });
    const file = `${createHash('sha1').update('cloudhop-demo').digest('hex')}.json`;
    await writeFile(
      join(cache, file),
      JSON.stringify({
        startUrl: 'https://demo.awsapps.com/start',
        region: 'us-east-1',
        accessToken: 'e2e-fake-token',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      }),
    );
  }

  const env = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    ...process.env,
    CLOUDHOP_HOME: home,
    CLOUDHOP_AWS_DIR: aws,
    NO_COLOR: '1',
    ...extra,
  });

  return {
    root,
    home,
    aws,
    env,
    /** Runs `cloudhop <args>` with stdin closed (no TTY), like CI or a script. */
    run(args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<RunResult> {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CLI, ...args], {
          env: env(extraEnv),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      });
    },
    readConfig: () => readFile(join(home, 'config.yaml'), 'utf8'),
    readAwsConfig: () => readFile(join(aws, 'config'), 'utf8').catch(() => ''),
    writeAwsConfig: (content: string) => writeFile(join(aws, 'config'), content),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * A fake `aws` for tests: prints its version, who it runs as (from the
 * environment cloudhop set) and the arguments it got. FAKE_AWS_EXPIRED=1
 * makes it fail like an expired SSO session.
 */
const FAKE_AWS = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('aws-cli/2.40.0 Python/3.12.0 fake'); process.exit(0); }
if (process.env.FAKE_AWS_EXPIRED === '1') { console.error('Error when retrieving token from sso: Token has expired and refresh failed'); process.exit(255); }
if (args[0] === 'sts') { console.log(JSON.stringify({ Account: '111111111111', Profile: process.env.AWS_PROFILE, Region: process.env.AWS_REGION })); process.exit(0); }
console.log(JSON.stringify({ args, profile: process.env.AWS_PROFILE, region: process.env.AWS_REGION }));
`;

/** Puts the fake `aws` first on a PATH (with a .cmd shim for Windows). */
export async function fakeAwsPath(dir: string): Promise<string> {
  const bin = join(dir, 'fake-bin');
  await mkdir(bin, { recursive: true });
  const script = join(bin, 'aws-fake.cjs');
  await writeFile(script, FAKE_AWS);
  await writeFile(join(bin, 'aws'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(join(bin, 'aws'), 0o755);
  await writeFile(join(bin, 'aws.cmd'), `@"${process.execPath}" "${script}" %*\r\n`);
  return [bin, process.env.PATH ?? ''].join(delimiter);
}

/** A PATH with only Node on it, to simulate a machine without the AWS CLI. */
export const PATH_WITHOUT_AWS = dirname(process.execPath);
