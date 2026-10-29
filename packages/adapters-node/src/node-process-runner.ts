import { spawn } from 'node:child_process';
import type { CaptureResult, ProcessRunner, RunOptions, RunResult, ToolInfo } from '@cloudhop/core';

const STDERR_TAIL_BYTES = 8 * 1024;

function buildEnv(overrides: RunOptions['env']): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

/** Windows needs a shell to resolve `aws.cmd`-style shims. */
const useShell = process.platform === 'win32';

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: buildEnv(options.env),
        stdio: ['inherit', 'inherit', options.captureStderr ? 'pipe' : 'inherit'],
        shell: useShell,
      });

      let tail = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
        tail = (tail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
      });

      // Ctrl-C reaches the child directly; the proxy must not die before it.
      const ignore = () => {};
      process.on('SIGINT', ignore);
      process.on('SIGTERM', ignore);
      const cleanup = () => {
        process.off('SIGINT', ignore);
        process.off('SIGTERM', ignore);
      };

      child.on('error', (error) => {
        cleanup();
        reject(error);
      });
      child.on('close', (code, signal) => {
        cleanup();
        resolve({ exitCode: code ?? (signal ? 128 + 2 : 1), stderrTail: tail });
      });
    });
  }

  capture(
    command: string,
    args: readonly string[],
    options: Pick<RunOptions, 'env'> = {},
  ): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { env: buildEnv(options.env), shell: useShell });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString();
      });
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      child.on('error', (error) => resolve({ exitCode: 127, stdout, stderr: error.message }));
      child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    });
  }

  async probe(command: string): Promise<ToolInfo> {
    const result = await this.capture(command, ['--version']);
    if (result.exitCode !== 0) return { installed: false };
    const output = `${result.stdout} ${result.stderr}`;
    // "aws-cli/2.36.9 Python/3.14.6 ..." or "azure-cli 2.60.0" or "Google Cloud SDK 480.0.0"
    const version = output.match(/(\d+\.\d+\.\d+)/)?.[1];
    return { installed: true, ...(version ? { version } : {}) };
  }
}
