import {
  type Alias,
  assertValidName,
  type CloudhopApp,
  CloudhopError,
  type CloudProvider,
  looksLikeProduction,
  type ProviderId,
  type Source,
  suggestAliases,
  suggestAliasName,
  type Target,
} from '@cloudhop/core';
import { interactive, type ParsedArgs } from '../flags';
import { answer, p, requireInteractive, validator } from '../ui';

/** Suggests "acme" for https://acme.awsapps.com/start. */
function suggestSourceId(settings: Record<string, string>, kind: string): string {
  const host = settings.startUrl?.match(/^https:\/\/([^./]+)\./)?.[1];
  return suggestAliasName(host ?? (kind === 'console-login' ? 'personal' : 'main'));
}

async function pickProvider(app: CloudhopApp): Promise<CloudProvider> {
  const { providers } = await app.config();
  if (providers.length === 0) {
    throw new Error('No cloud is enabled yet. Run `cloudhop setup` first.');
  }
  if (providers.length === 1) return app.provider(providers[0] as ProviderId);
  const id = answer(
    await p.select({
      message: 'Which cloud?',
      options: providers.map((id) => ({ value: id, label: app.provider(id).displayName })),
    }),
  );
  return app.provider(id);
}

async function askSource(app: CloudhopApp, provider: CloudProvider): Promise<Source> {
  const kind = answer(
    await p.select({
      message: 'What do you want to add?',
      options: provider.sourceKinds.map((k) => ({
        value: k,
        label: k.label,
        ...(k.hint ? { hint: k.hint } : {}),
      })),
    }),
  );

  const settings: Record<string, string> = {};
  for (const field of kind.fields) {
    settings[field.key] =
      answer(
        await p.text({
          message: field.label,
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.defaultValue
            ? { defaultValue: field.defaultValue, placeholder: field.defaultValue }
            : {}),
          validate: field.defaultValue
            ? (v) => (v ? field.validate?.(v.trim()) : undefined)
            : validator(field.validate),
        }),
      ).trim() ||
      (field.defaultValue ?? '');
  }

  const taken = new Set((await app.config()).sources.map((s) => s.id));
  const suggestion = suggestSourceId(settings, kind.kind);
  const id =
    answer(
      await p.text({
        message: `${kind.nameLabel ?? 'Short name for this source'} (used in \`cloudhop login <name>\`)`,
        placeholder: suggestion,
        defaultValue: suggestion,
        validate: (v) => (taken.has(v || suggestion) ? 'That name is taken.' : undefined),
      }),
    ).trim() || suggestion;

  return { id, provider: provider.id, kind: kind.kind, settings };
}

/** The provider's own region check for this kind of source, if it has one. */
export function regionValidator(
  app: CloudhopApp,
  source: Source,
): ((value: string) => string | undefined) | undefined {
  return app
    .provider(source.provider)
    .sourceKinds.find((k) => k.kind === source.kind)
    ?.fields.find((f) => f.key === 'region')?.validate;
}

/** Lets the user pick targets and name an alias for each. */
export async function chooseAliases(
  app: CloudhopApp,
  source: Source,
  targets: Target[],
): Promise<Alias[]> {
  if (targets.length === 0) {
    p.log.warn('This source has no accounts or roles assigned to you.');
    return [];
  }

  const existing = new Set((await app.config()).aliases.map((a) => a.name));
  const selected =
    targets.length === 1
      ? targets
      : answer(
          await p.autocompleteMultiselect({
            message: `Pick the accounts/roles to create aliases for (${targets.length} available, type to filter)`,
            options: targets.map((t) => ({ value: t, label: t.label })),
            required: true,
          }),
        );

  // Each alias gets its own region; the last one typed becomes the next default.
  const validateRegion = regionValidator(app, source);
  let defaultRegion = source.settings.region ?? '';
  const suggestions = suggestAliases(targets, source.id, existing);

  const aliases: Alias[] = [];
  for (const target of selected) {
    p.log.step(target.label);
    const suggestion = uniqueName(
      targets.length === 1 && target.id === 'console'
        ? source.id
        : (suggestions.get(target.id) ?? suggestAliasName(target.label)),
      existing,
    );
    const name =
      answer(
        await p.text({
          message: 'Alias (what you will type after `hop`)',
          placeholder: suggestion,
          defaultValue: suggestion,
          validate: (v) =>
            existing.has(v || suggestion) ? 'That alias already exists.' : undefined,
        }),
      ).trim() || suggestion;
    const region =
      answer(
        await p.text({
          message: `Region for ${name}`,
          placeholder: defaultRegion,
          defaultValue: defaultRegion,
          validate: (v) => (v?.trim() ? validateRegion?.(v.trim()) : undefined),
        }),
      ).trim() || defaultRegion;
    const prod = answer(
      await p.confirm({
        message: `Is ${name} production? (cloudhop then asks before any change)`,
        initialValue: looksLikeProduction(name, target.label),
      }),
    );
    defaultRegion = region;
    existing.add(name);
    aliases.push({
      name,
      source: source.id,
      target: target.id,
      ...(region && region !== source.settings.region ? { region } : {}),
      ...(prod ? { prod: true } : {}),
    });
  }
  return aliases;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`;
  return name;
}

const ADD_HINT =
  'Pass everything as flags, e.g. `cloudhop add aws sso --start-url https://acme.awsapps.com/start --region us-east-1 --name acme`.';

/** Builds a source from `cloudhop add <provider> <kind> --<field> <value>... [--name id]`. */
function sourceFromFlags(app: CloudhopApp, { positional, flags }: ParsedArgs): Source {
  const [providerId, kindId] = positional;
  const provider = app.provider(providerId as ProviderId);
  const kind = provider.sourceKinds.find((k) => k.kind === kindId);
  if (!kind) {
    const kinds = provider.sourceKinds.map((k) => k.kind).join(', ');
    throw new CloudhopError(
      'INVALID_NAME',
      `Unknown source kind "${kindId ?? ''}".`,
      `Use one of: ${kinds}.`,
    );
  }
  const settings: Record<string, string> = {};
  for (const field of kind.fields) {
    const value = flags[field.key]?.trim() || field.defaultValue;
    const flag = `--${field.key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    if (!value)
      throw new CloudhopError('INVALID_NAME', `Missing ${flag} (${field.label}).`, ADD_HINT);
    const problem = field.validate?.(value);
    if (problem) throw new CloudhopError('INVALID_NAME', `${flag}: ${problem}`);
    settings[field.key] = value;
  }
  const id = flags.name ?? suggestSourceId(settings, kind.kind);
  assertValidName('source', id);
  return { id, provider: provider.id, kind: kind.kind, settings };
}

function printTargets(sourceId: string, targets: readonly Target[]): void {
  for (const t of targets) console.log(`  ${t.id.padEnd(40)} ${t.label}`);
  console.log(
    `\nCreate an alias with:  cloudhop alias ${sourceId} --target <id> --name <alias> [--region <r>]`,
  );
}

export async function addCommand(app: CloudhopApp, args: ParsedArgs): Promise<void> {
  if (args.positional.length > 0) {
    const source = sourceFromFlags(app, args);
    const report = await app.connectSource(source);
    console.log(`Source "${source.id}" added. ${report.targets.length} account/role(s) available:`);
    printTargets(source.id, report.targets);
    return;
  }

  requireInteractive('add', ADD_HINT);
  p.intro('cloudhop add');
  const provider = await pickProvider(app);
  const source = await askSource(app, provider);
  const report = await app.connectSource(source);
  p.log.success(`Logged in. Found ${report.targets.length} account/role combination(s).`);

  const aliases = await chooseAliases(app, source, report.targets);
  await app.addAliases(aliases);

  const first = aliases[0]?.name;
  p.outro(
    first
      ? `Ready! Try:  hop ${first} sts get-caller-identity`
      : `Source "${source.id}" saved. Create aliases later with \`cloudhop alias ${source.id}\`.`,
  );
}

/**
 * Creates more aliases from an existing source: interactively, or with
 * `--target <id> --name <alias> [--region r]`; `--list` (or no terminal) prints the targets.
 */
export async function aliasCommand(
  app: CloudhopApp,
  { positional, flags }: ParsedArgs,
): Promise<void> {
  const { sources } = await app.config();
  if (sources.length === 0) throw new Error('No sources yet. Run `cloudhop add` first.');
  const scripted = Boolean(flags.target || flags.list) || !interactive();
  if (scripted && !positional[0]) {
    throw new CloudhopError('SOURCE_NOT_FOUND', 'Say which source: `cloudhop alias <source> ...`.');
  }
  const id =
    positional[0] ??
    answer(
      await p.select({
        message: 'From which source?',
        options: sources.map((s) => ({ value: s.id, label: s.id })),
      }),
    );
  const source = sources.find((s) => s.id === id);
  if (!source) throw new CloudhopError('SOURCE_NOT_FOUND', `Source "${id}" not found.`);

  await app.ensureSession(id);
  let targets = await app.listTargets(id);
  if (targets.length === 0) targets = (await app.syncSource(id)).targets;

  if (flags.target) {
    const target = targets.find((t) => t.id === flags.target);
    if (!target) {
      throw new CloudhopError(
        'TARGET_NOT_FOUND',
        `"${flags.target}" is not available in "${id}".`,
        `See the options with \`cloudhop alias ${id} --list\`.`,
      );
    }
    const taken = new Set((await app.config()).aliases.map((a) => a.name));
    const name = flags.name ?? suggestAliases(targets, id, taken).get(target.id) ?? id;
    await app.addAliases([
      {
        name,
        source: id,
        target: target.id,
        ...(flags.region ? { region: flags.region } : {}),
        ...(flags.prod ? { prod: true } : {}),
      },
    ]);
    console.log(
      `Alias "${name}" → ${target.label}${flags.prod ? ' (production)' : ''}. Try:  hop ${name}`,
    );
    return;
  }
  if (scripted) {
    printTargets(id, targets);
    return;
  }

  p.intro(`cloudhop alias ${id}`);
  const aliases = await chooseAliases(app, source, targets);
  await app.addAliases(aliases);
  p.outro(`Created ${aliases.length} alias(es).`);
}
