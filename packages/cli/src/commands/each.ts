import { type AliasStatus, type CloudhopApp, CloudhopError } from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { answer, bold, p, paint } from '../ui';

const MAX_PATTERN = 200;

/** `'globex-*'` → /^globex-.*$/, `'/^creci-(qa|prod)$/i'` → as written, `acme-dev` → exact. */
function matcher(selector: string): (name: string) => boolean {
  const regex = /^\/(.+)\/([a-z]*)$/.exec(selector);
  if (regex) {
    // The user's own pattern, matched against their own alias names (63
    // characters at most); the cap keeps a typo from hanging the command.
    if (selector.length > MAX_PATTERN) {
      throw new CloudhopError(
        'INVALID_NAME',
        `That regular expression is too long (max ${MAX_PATTERN}).`,
      );
    }
    try {
      const re = new RegExp(regex[1] as string, regex[2]);
      return (name) => re.test(name);
    } catch {
      throw new CloudhopError('INVALID_NAME', `Invalid regular expression: ${selector}`);
    }
  }
  if (/[*?]/.test(selector)) {
    const escaped = selector
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`);
    return (name) => re.test(name);
  }
  return (name) => name === selector;
}

/** The aliases a selection names: the union of its patterns, then the --source/--prod filters. */
export function selectAliases(
  aliases: readonly AliasStatus[],
  selectors: readonly string[],
  filters: { source?: string; prod?: boolean },
): AliasStatus[] {
  const patterns = selectors
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  const tests = patterns.map(matcher);
  for (const [i, pattern] of patterns.entries()) {
    const plain = !/[*?]/.test(pattern) && !pattern.startsWith('/');
    if (plain && !aliases.some((a) => tests[i]?.(a.name))) {
      throw new CloudhopError(
        'ALIAS_NOT_FOUND',
        `Alias "${pattern}" not found.`,
        'See your aliases with `cloudhop ls`.',
      );
    }
  }
  return aliases.filter(
    (a) =>
      (tests.length === 0 || tests.some((t) => t(a.name))) &&
      (filters.source === undefined || a.source === filters.source) &&
      (filters.prod === undefined || a.prod === filters.prod),
  );
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

interface Outcome {
  alias: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * `cloudhop each <selection...> [--source s] [--prod|--no-prod] [--parallel n]
 * [--yes] [--json] -- <cli args>`: runs one cloud CLI command in many aliases,
 * in parallel, after showing which ones and asking.
 */
export async function eachCommand(app: CloudhopApp, args: string[]): Promise<number> {
  const separator = args.indexOf('--');
  if (separator === -1 || separator === args.length - 1) {
    throw new CloudhopError(
      'INVALID_NAME',
      'Usage: cloudhop each <alias|list|pattern|/regex/...> [--source <s>] [--prod|--no-prod] -- <command>',
      "Example: cloudhop each 'creci-*' -- s3 ls",
    );
  }
  const { positional, flags } = parseArgs(args.slice(0, separator));
  const cliArgs = args.slice(separator + 1);
  if (positional.length === 0 && !flags.source && !flags.prod && !flags.noProd) {
    throw new CloudhopError(
      'INVALID_NAME',
      'Say which aliases: names, a pattern like "globex-*", /regex/, --source or --prod.',
    );
  }
  const prodFilter = flags.prod ? true : flags.noProd ? false : undefined;
  const { aliases } = await app.overview();
  const selected = selectAliases(aliases, positional, {
    ...(flags.source ? { source: flags.source } : {}),
    ...(prodFilter !== undefined ? { prod: prodFilter } : {}),
  });
  if (selected.length === 0)
    throw new CloudhopError('ALIAS_NOT_FOUND', 'No alias matches that selection.');

  const command = `aws ${cliArgs.join(' ')}`;
  const width = Math.max(...selected.map((a) => a.name.length)) + 2;
  const listing = selected
    .map(
      (a) =>
        `  ${a.name.padEnd(width)}${(a.region ?? '-').padEnd(12)}${a.label ?? a.target}${a.prod ? `  ${paint('red', 'PROD')}` : ''}`,
    )
    .join('\n');
  const risky = [];
  for (const a of selected)
    if (await app.needsProductionConfirmation(a.name, cliArgs)) risky.push(a.name);

  const tty = interactive();
  if (!flags.json)
    process.stderr.write(
      `${bold(`${selected.length} alias(es)`)} will run ${paint('sky', command)}\n${listing}\n`,
    );
  if (!flags.yes) {
    if (!tty)
      throw new CloudhopError(
        'NOT_INTERACTIVE',
        'Confirm with --yes to run in several aliases without a terminal.',
      );
    if (
      !answer(
        await p.confirm({
          message: `Run it in these ${selected.length} alias(es)?`,
          initialValue: false,
        }),
      )
    )
      return 130;
  }
  if (risky.length > 0 && process.env.CLOUDHOP_CONFIRM_PROD !== '1') {
    if (!tty) {
      throw new CloudhopError(
        'PROD_CONFIRMATION_REQUIRED',
        `This may change resources in production: ${risky.join(', ')}.`,
        'Run it in a terminal to confirm, or set CLOUDHOP_CONFIRM_PROD=1 once a person has approved it.',
      );
    }
    p.log.warn(
      `${paint('red', bold('PRODUCTION'))} ${risky.join(', ')}: this may change resources.`,
    );
    if (!answer(await p.confirm({ message: 'Also run it in production?', initialValue: false })))
      return 130;
  }

  // Sign in first, one source at a time, so parallel runs never race for the browser.
  for (const source of new Set(selected.map((a) => a.source))) {
    await app.ensureSession(source, { interactive: tty });
  }

  const parallel = Math.max(1, Math.min(16, Number(flags.parallel) || 4));
  const outcomes = await mapLimit(selected, parallel, async (a): Promise<Outcome> => {
    try {
      const r = await app.captureAsAlias(a.name, cliArgs);
      const outcome = { alias: a.name, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
      if (!flags.json) printOutcome(outcome, width);
      return outcome;
    } catch (error) {
      const outcome = { alias: a.name, exitCode: 1, stdout: '', stderr: (error as Error).message };
      if (!flags.json) printOutcome(outcome, width);
      return outcome;
    }
  });

  const failed = outcomes.filter((o) => o.exitCode !== 0);
  if (flags.json) {
    console.log(JSON.stringify({ version: 1, command: cliArgs, results: outcomes }, null, 2));
  } else {
    const summary = `${outcomes.length - failed.length} ok${failed.length ? `, ${failed.length} failed: ${failed.map((f) => f.alias).join(', ')}` : ''}`;
    process.stderr.write(`${failed.length ? paint('red', summary) : paint('green', summary)}\n`);
  }
  return failed.length ? 1 : 0;
}

/** Each line tagged with its alias, so the output can be grepped and sorted. */
function printOutcome({ alias, exitCode, stdout, stderr }: Outcome, width: number): void {
  const tag = paint(exitCode === 0 ? 'sky' : 'red', `[${alias}]`.padEnd(width + 2));
  for (const line of stdout.replace(/\n$/, '').split('\n'))
    if (line) process.stdout.write(`${tag} ${line}\n`);
  for (const line of stderr.replace(/\n$/, '').split('\n'))
    if (line) process.stderr.write(`${tag} ${paint('dim', line)}\n`);
  if (exitCode !== 0) process.stderr.write(`${tag} ${paint('red', `exit ${exitCode}`)}\n`);
}
