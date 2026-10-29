import { NodeBrowserOpener } from '@cloudhop/adapters-node';
import { type CloudhopApp, CloudhopError } from '@cloudhop/core';
import { startUiServer } from '@cloudhop/ui';
import type { ParsedArgs } from '../flags';
import { bold } from '../ui';

/** `cloudhop ui [--port n] [--no-open]`: serves the local web UI until Ctrl-C. */
export async function uiCommand(app: CloudhopApp, { flags }: ParsedArgs): Promise<void> {
  const port = flags.port ? Number(flags.port) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CloudhopError('INVALID_NAME', `--port must be a number between 1 and 65535.`);
  }

  const server = await startUiServer({ app, port });
  console.log(`cloudhop UI running at ${bold(server.url)}`);
  console.log('Only this computer can open it, and the link works only while this runs.');
  console.log('Press Ctrl-C to stop.');
  if (!flags.noOpen) await new NodeBrowserOpener().open(server.url);

  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await server.close();
}
