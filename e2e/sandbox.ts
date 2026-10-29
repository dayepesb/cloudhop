import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/** A PATH with only Node on it, to simulate a machine without the AWS CLI. */
export const PATH_WITHOUT_AWS = dirname(process.execPath);
