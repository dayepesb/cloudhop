import {
  type CloudhopApp,
  CloudhopError,
  PROVIDER_IDS,
  type ProviderId,
  type SessionState,
  type SyncReport,
} from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { answer, bold, p, paint } from '../ui';
import { regionValidator } from './add';

function printReport(report: SyncReport): void {
  const changes = [
    `${report.targets.length} available`,
    report.added.length ? `${report.added.length} new` : '',
    report.removed.length ? `${report.removed.length} removed` : '',
  ].filter(Boolean);
  p.log.success(`${report.sourceId}: ${changes.join(', ')}.`);
  for (const t of report.added) p.log.message(`  + ${t.label}`);
  for (const t of report.removed) p.log.message(`  - ${t.label}`);
  if (report.orphanedAliases.length) {
    p.log.warn(
      `No longer available: ${report.orphanedAliases.join(', ')}. Remove them with \`cloudhop rm <alias>\`.`,
    );
  }
}

export async function syncCommand(app: CloudhopApp, sourceId: string | undefined): Promise<void> {
  const ids = sourceId ? [sourceId] : (await app.config()).sources.map((s) => s.id);
  if (ids.length === 0) {
    p.log.info('No sources yet. Run `cloudhop add`.');
    return;
  }
  for (const id of ids) {
    await app.ensureSession(id);
    printReport(await app.syncSource(id));
  }
}

export async function loginCommand(app: CloudhopApp, sourceId: string | undefined): Promise<void> {
  const { sources } = await app.config();
  const id =
    sourceId ??
    answer(
      await p.select({
        message: 'Log in to which source?',
        options: sources.map((s) => ({ value: s.id, label: s.id })),
      }),
    );
  printReport(await app.login(id));
}

const SESSION_LABEL: Record<SessionState, string> = {
  valid: paint('green', '● session valid'),
  refreshable: paint('yellow', '◐ renews automatically on next use'),
  expired: paint('red', '○ expired, opens the browser on next use'),
  unknown: paint('dim', '· session managed by the cloud CLI'),
};

/** Lists every source with its aliases underneath; `cloudhop ls <source>` shows just one. */
export async function listCommand(app: CloudhopApp, sourceId?: string): Promise<void> {
  const config = await app.config();
  if (config.sources.length === 0) {
    console.log('Nothing here yet. Run `cloudhop setup` to get started.');
    return;
  }
  const sources = sourceId ? config.sources.filter((s) => s.id === sourceId) : config.sources;
  if (sources.length === 0) {
    throw new CloudhopError(
      'SOURCE_NOT_FOUND',
      `Source "${sourceId}" not found.`,
      `Sources: ${config.sources.map((s) => s.id).join(', ')}.`,
    );
  }

  const aliases = await app.listAliases();
  const nameWidth = Math.max(5, ...aliases.map((a) => a.alias.name.length)) + 2;
  const regionWidth = Math.max(6, ...aliases.map((a) => (a.region ?? '-').length)) + 2;

  for (const [index, source] of sources.entries()) {
    const provider = app.provider(source.provider);
    const state = await provider.sessionState(source);
    const where = source.settings.startUrl ?? source.kind;
    if (index > 0) console.log('');
    console.log(
      `${bold(paint('sky', source.id))}  ${paint('dim', `${provider.displayName} · ${where}`)}`,
    );
    console.log(`  ${SESSION_LABEL[state]}`);

    const own = aliases.filter((a) => a.alias.source === source.id);
    if (own.length === 0) {
      console.log(paint('dim', `  no aliases yet: \`cloudhop alias ${source.id}\``));
      continue;
    }
    console.log(
      paint('dim', `  ${'ALIAS'.padEnd(nameWidth)}${'REGION'.padEnd(regionWidth)}ACCOUNT / ROLE`),
    );
    for (const { alias, target, region } of own) {
      const label = target ? target.label : paint('red', `${alias.target} (no longer available)`);
      console.log(
        `  ${alias.name.padEnd(nameWidth)}${(region ?? '-').padEnd(regionWidth)}${label}`,
      );
    }
  }
}

/**
 * `cloudhop rm <name...>` removes aliases or whole sources (a source takes its
 * aliases with it, so it asks first). `--source <id>` forces the source meaning.
 */
export async function removeCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const config = await app.config();
  const requests = [
    ...(flags.source ? [{ name: flags.source, asSource: true }] : []),
    ...positional.map((name) => ({ name, asSource: false })),
  ];
  if (requests.length === 0) {
    throw new CloudhopError(
      'ALIAS_NOT_FOUND',
      'Usage: cloudhop rm <alias-or-source...>',
      'See what exists with `cloudhop ls`.',
    );
  }

  for (const { name, asSource } of requests) {
    if (!asSource && config.aliases.some((a) => a.name === name)) {
      await app.removeAlias(name);
      p.log.success(`Removed alias ${name}.`);
      continue;
    }
    const source = config.sources.find((s) => s.id === name);
    if (!source) {
      throw new CloudhopError(
        asSource ? 'SOURCE_NOT_FOUND' : 'ALIAS_NOT_FOUND',
        `No ${asSource ? 'source' : 'alias or source'} named "${name}".`,
        'See what exists with `cloudhop ls`.',
      );
    }
    const count = config.aliases.filter((a) => a.source === name).length;
    const what = `source "${name}"${count ? ` and its ${count} alias(es)` : ''}`;
    if (!flags.yes) {
      if (!interactive()) {
        throw new CloudhopError(
          'NOT_INTERACTIVE',
          `Removing ${what} needs confirmation.`,
          'Add --yes.',
        );
      }
      const ok = answer(await p.confirm({ message: `Remove ${what}?`, initialValue: false }));
      if (!ok) continue;
    }
    await app.removeSource(name);
    p.log.success(`Removed ${what}.`);
  }
}

export async function providerCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const [action = 'ls', id] = args;
  if (action === 'ls' || action === 'list') {
    const { providers } = await app.config();
    for (const pid of PROVIDER_IDS) {
      const available = app.availableProviders().some((x) => x.id === pid);
      const status = providers.includes(pid) ? 'enabled' : available ? 'disabled' : 'coming soon';
      console.log(`  ${pid.padEnd(8)} ${status}`);
    }
    return;
  }
  if (!id || !PROVIDER_IDS.includes(id as ProviderId)) {
    throw new Error(`Usage: cloudhop provider ${action} <${PROVIDER_IDS.join('|')}>`);
  }
  if (action === 'enable') await app.enableProvider(id as ProviderId);
  else if (action === 'disable') await app.disableProvider(id as ProviderId);
  else throw new Error('Usage: cloudhop provider [ls|enable|disable] <provider>');
  p.log.success(`${id} ${action}d.`);
}

/** `cloudhop region <alias> [region]`: changes the region an alias runs in. */
export async function regionCommand(app: CloudhopApp, args: string[]): Promise<void> {
  const [aliasArg, regionArg] = args;
  if ((!aliasArg || !regionArg) && !interactive()) {
    throw new CloudhopError('INVALID_NAME', 'Usage: cloudhop region <alias> <region>');
  }
  const aliases = await app.listAliases();
  const name =
    aliasArg ??
    answer(
      await p.select({
        message: 'Which alias?',
        options: aliases.map((a) => ({
          value: a.alias.name,
          label: a.alias.name,
          hint: `${a.target?.label ?? a.alias.target}, ${a.region}`,
        })),
      }),
    );
  const current = await app.resolveAlias(name);
  const validate = regionValidator(app, current.source);

  const region =
    regionArg?.trim() ??
    (answer(
      await p.text({
        message: `Region for ${name}`,
        placeholder: current.region,
        defaultValue: current.region,
        validate: (v) => (v?.trim() ? validate?.(v.trim()) : undefined),
      }),
    ).trim() ||
      current.region);
  const problem = region ? validate?.(region) : 'Say which region.';
  if (!region || problem) throw new CloudhopError('INVALID_NAME', problem ?? 'Invalid region.');

  await app.setAliasRegion(name, region);
  console.log(`${name}: ${current.region ?? '(none)'} → ${region}`);
}
