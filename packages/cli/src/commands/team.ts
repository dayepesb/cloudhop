import { readFile, writeFile } from 'node:fs/promises';
import {
  type Alias,
  assertValidName,
  type CloudhopApp,
  CloudhopError,
  PROVIDER_IDS,
  type ProviderId,
  type Source,
} from '@cloudhop/core';
import { parse, stringify } from 'yaml';
import { interactive, parseArgs } from '../flags';
import { answer, bold, p, paint } from '../ui';

const MAX_BYTES = 256 * 1024;

interface TeamFile {
  version: 1;
  sources: Record<string, { provider: ProviderId; kind: string; settings: Record<string, string> }>;
  aliases: Record<string, { source: string; target: string; region?: string; prod?: boolean }>;
}

const HEADER = `# cloudhop team setup: import it with \`cloudhop team import <this file or its https URL>\`.
# No secrets: portal URLs, regions, account ids and role names only.
`;

/** Validates an imported file field by field: it is data from someone else, never trusted as is. */
function validate(app: CloudhopApp, raw: unknown): TeamFile {
  const bad = (why: string) =>
    new CloudhopError('INVALID_NAME', `Not a cloudhop team file: ${why}.`);
  if (!raw || typeof raw !== 'object') throw bad('it is empty');
  const file = raw as Partial<TeamFile>;
  if (file.version !== 1) throw bad('unknown "version" (expected 1)');
  const sources = file.sources ?? {};
  const aliases = file.aliases ?? {};
  for (const [id, source] of Object.entries(sources)) {
    assertValidName('source', id);
    if (!PROVIDER_IDS.includes(source?.provider))
      throw bad(`source "${id}" has an unknown provider`);
    const kind = app.provider(source.provider).sourceKinds.find((k) => k.kind === source.kind);
    if (!kind) throw bad(`source "${id}" has an unknown kind`);
    for (const field of kind.fields) {
      const value = source.settings?.[field.key];
      if (typeof value !== 'string' || !value) throw bad(`source "${id}" is missing ${field.key}`);
      const problem = field.validate?.(value);
      if (problem) throw bad(`source "${id}": ${problem}`);
    }
  }
  for (const [name, alias] of Object.entries(aliases)) {
    assertValidName('alias', name);
    if (!alias || typeof alias.target !== 'string' || !sources[alias.source]) {
      throw bad(`alias "${name}" must name a source of this file and a target`);
    }
  }
  return { version: 1, sources, aliases } as TeamFile;
}

async function load(location: string): Promise<string> {
  if (/^http:\/\//i.test(location)) throw new CloudhopError('INVALID_NAME', 'Use an https:// URL.');
  if (/^https:\/\//i.test(location)) {
    const response = await fetch(location, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok)
      throw new CloudhopError('INVALID_NAME', `Could not download it (HTTP ${response.status}).`);
    const text = await response.text();
    if (text.length > MAX_BYTES)
      throw new CloudhopError('INVALID_NAME', 'That file is too big for a team setup.');
    return text;
  }
  return readFile(location, 'utf8');
}

/**
 * `cloudhop team export [--sources a,b] [--out file]` and
 * `cloudhop team import <file|https URL> [--yes]`: share portals and
 * suggested aliases with a team. Personal accounts are never exported.
 */
export async function teamCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const [action, location] = positional;

  if (action === 'export') {
    const config = await app.config();
    const wanted = flags.sources?.split(',').map((s) => s.trim());
    const sources = config.sources.filter(
      (s) => s.kind !== 'console-login' && (!wanted || wanted.includes(s.id)),
    );
    const ids = new Set(sources.map((s) => s.id));
    const file: TeamFile = {
      version: 1,
      sources: Object.fromEntries(sources.map(({ id, ...rest }) => [id, rest])),
      aliases: Object.fromEntries(
        config.aliases.filter((a) => ids.has(a.source)).map(({ name, ...rest }) => [name, rest]),
      ),
    };
    const text = HEADER + stringify(file);
    if (flags.out) {
      await writeFile(flags.out, text);
      console.error(
        `${paint('green', '✔')} Wrote ${sources.length} source(s) and ${Object.keys(file.aliases).length} alias(es) to ${flags.out}.`,
      );
    } else {
      process.stdout.write(text);
    }
    return;
  }

  if (action !== 'import' || !location) {
    throw new CloudhopError(
      'INVALID_NAME',
      'Usage: cloudhop team export [--out file] | cloudhop team import <file|https URL>',
    );
  }

  const team = validate(app, parse(await load(location)));
  const config = await app.config();
  const existingSources = new Map(config.sources.map((s) => [s.id, s]));
  const sameUrl = (a: Source['settings'], b: Source['settings']) =>
    a.startUrl !== undefined && a.startUrl === b.startUrl;

  const newSources: Source[] = [];
  const sourceMap = new Map<string, string>(); // team id → local id
  for (const [id, source] of Object.entries(team.sources)) {
    const match = config.sources.find(
      (s) => s.provider === source.provider && sameUrl(s.settings, source.settings),
    );
    if (match) {
      sourceMap.set(id, match.id);
      continue;
    }
    if (existingSources.has(id))
      throw new CloudhopError(
        'SOURCE_EXISTS',
        `You already have a different source named "${id}".`,
        'Rename yours with `cloudhop rm` and add it again, or edit the team file.',
      );
    newSources.push({ id, ...source });
    sourceMap.set(id, id);
  }
  const takenAliases = new Set(config.aliases.map((a) => a.name));
  const newAliases: Alias[] = [];
  const skipped: string[] = [];
  for (const [name, alias] of Object.entries(team.aliases)) {
    if (takenAliases.has(name)) skipped.push(name);
    else newAliases.push({ name, ...alias, source: sourceMap.get(alias.source) as string });
  }

  if (newSources.length === 0 && newAliases.length === 0) {
    console.log('Nothing to import: you already have everything in this file.');
    return;
  }
  console.log(bold('This team setup will add:'));
  for (const s of newSources)
    console.log(
      `  source ${bold(s.id)}  ${paint('sky', s.settings.startUrl ?? s.kind)}  ${s.settings.region ?? ''}`,
    );
  for (const a of newAliases)
    console.log(`  alias  ${a.name}  ${a.target}${a.prod ? `  ${paint('red', 'PROD')}` : ''}`);
  if (skipped.length)
    console.log(paint('dim', `  (skipping aliases you already have: ${skipped.join(', ')})`));
  if (newSources.length)
    console.log(
      paint('yellow', "Check that these portal URLs are your organization's before signing in."),
    );
  if (!flags.yes) {
    if (!interactive())
      throw new CloudhopError(
        'NOT_INTERACTIVE',
        'Review the list above and rerun with --yes to import it.',
      );
    if (
      !answer(
        await p.confirm({
          message: 'Import it? Each new portal opens your browser to sign in.',
          initialValue: true,
        }),
      )
    )
      return;
  }

  const providers = new Set((await app.config()).providers);
  for (const s of newSources) if (!providers.has(s.provider)) await app.enableProvider(s.provider);
  for (const source of newSources) {
    const report = await app.connectSource(source);
    console.log(
      `${paint('green', '✔')} ${source.id}: signed in, ${report.targets.length} account/role(s).`,
    );
  }
  // Only aliases this person can actually use: everything else is reported, not created.
  const usable: Alias[] = [];
  const missing: string[] = [];
  for (const alias of newAliases) {
    const targets = await app.listTargets(alias.source);
    if (targets.some((t) => t.id === alias.target)) usable.push(alias);
    else missing.push(alias.name);
  }
  if (usable.length) await app.addAliases(usable);
  console.log(
    `${paint('green', '✔')} Created ${usable.length} alias(es)${usable.length ? `: ${usable.map((a) => a.name).join(', ')}` : ''}.`,
  );
  if (missing.length)
    console.log(
      paint(
        'yellow',
        `Not created, you don't have access to their account/role: ${missing.join(', ')}.`,
      ),
    );
}
