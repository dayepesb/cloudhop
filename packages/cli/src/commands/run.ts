import { type CloudhopApp, CloudhopError, type RunOverrides } from '@cloudhop/core';
import { interactive } from '../flags';
import { answer, bold, notify, p, paint } from '../ui';

/**
 * Production aliases: say so on every command, and ask before anything that
 * may change resources. Without a terminal it refuses unless
 * CLOUDHOP_CONFIRM_PROD=1 says a person already agreed.
 */
async function guardProduction(
  app: CloudhopApp,
  alias: string,
  args?: readonly string[],
): Promise<void> {
  const status = await app.aliasStatus(alias).catch(() => undefined);
  if (!status?.prod) return;
  const where = `${status.label ?? status.target}${status.region ? `, ${status.region}` : ''}`;
  if (!(await app.needsProductionConfirmation(alias, args))) {
    if (process.stderr.isTTY) notify(paint('red', `${alias} is production (${where})`));
    return;
  }
  if (process.env.CLOUDHOP_CONFIRM_PROD === '1') return;
  const what = args ? `aws ${args.join(' ')}` : 'this command';
  if (!interactive()) {
    throw new CloudhopError(
      'PROD_CONFIRMATION_REQUIRED',
      `${alias} is production and ${what} may change resources.`,
      'Run it in a terminal to confirm, or set CLOUDHOP_CONFIRM_PROD=1 once a person has approved it.',
    );
  }
  p.log.warn(
    `${paint('red', bold('PRODUCTION'))}  ${bold(alias)} → ${where}\n${paint('dim', 'This may change resources:')} ${what}`,
  );
  const ok = answer(await p.confirm({ message: `Run it in ${alias}?`, initialValue: false }));
  if (!ok) throw new CloudhopError('PROD_CONFIRMATION_REQUIRED', 'Cancelled: nothing ran.');
}

/** `hop <alias> <args...>`: the provider's CLI as that alias. No args = "who am I". */
export async function proxyCommand(
  app: CloudhopApp,
  alias: string,
  args: string[],
): Promise<number> {
  const cliArgs = args.length > 0 ? args : await app.identityArgs(alias);
  await guardProduction(app, alias, cliArgs);
  return app.runAsAlias(alias, cliArgs);
}

/** `cloudhop exec <alias> [--region r] -- <command...>`: any tool with temporary credentials. */
export async function execCommand(app: CloudhopApp, args: string[]): Promise<number> {
  const separator = args.indexOf('--');
  const before = separator === -1 ? args.slice(0, 1) : args.slice(0, separator);
  const command = separator === -1 ? args.slice(1) : args.slice(separator + 1);
  const [alias, ...flags] = before;
  if (!alias || command.length === 0) {
    throw new Error('Usage: cloudhop exec <alias> [--region <region>] -- <command> [args...]');
  }
  const overrides: RunOverrides = {};
  const regionIndex = flags.indexOf('--region');
  if (regionIndex !== -1 && flags[regionIndex + 1])
    overrides.region = flags[regionIndex + 1] as string;
  // cloudhop can't tell what another tool will do: production always asks.
  await guardProduction(app, alias);
  const [bin, ...rest] = command as [string, ...string[]];
  return app.execAsAlias(alias, bin, rest, overrides);
}
