import type { CloudhopApp } from '@cloudhop/core';
import { parseArgs } from '../flags';
import { pickAlias } from '../picker';
import { notify } from '../ui';

const HOW: Record<string, string> = {
  'signed-in': 'signed in',
  portal: 'through the SSO portal (AWS did not accept a direct sign-in)',
  'sign-in-page': 'at the sign-in page (sign in with your console user)',
};

/**
 * `cloudhop console [alias] [service] [--region r]`: opens the web console as
 * the alias, already signed in, without the access portal. The sign-in URL is
 * a secret, so it is opened and never printed.
 */
export async function consoleCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const alias = positional[0] ?? (await pickAlias(app, 'Open the console as'));
  const service = positional[1];
  const via = await app.openConsole(alias, {
    ...(service ? { service } : {}),
    ...(flags.region ? { region: flags.region } : {}),
  });
  notify(`Opened the ${service ? `${service} ` : ''}console for ${alias}, ${HOW[via]}.`);
}
