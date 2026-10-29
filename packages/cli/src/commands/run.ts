import type { CloudhopApp, RunOverrides } from '@cloudhop/core';

/** `hop <alias> <args...>`: the provider's CLI as that alias. No args = "who am I". */
export async function proxyCommand(
  app: CloudhopApp,
  alias: string,
  args: string[],
): Promise<number> {
  const resolved = await app.resolveAlias(alias);
  const defaultArgs = resolved.source.provider === 'aws' ? ['sts', 'get-caller-identity'] : [];
  return app.runAsAlias(alias, args.length > 0 ? args : defaultArgs);
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
  const [bin, ...rest] = command as [string, ...string[]];
  return app.execAsAlias(alias, bin, rest, overrides);
}
