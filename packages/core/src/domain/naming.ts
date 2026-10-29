import { CloudhopError } from './errors';

/** Words the CLI uses as commands, so they can't be alias names. */
export const RESERVED_NAMES = new Set([
  'add',
  'agent',
  'alias',
  'login',
  'team',
  'shell',
  'use',
  'each',
  'console',
  'prod',
  'rename',
  'mv',
  'mcp',
  'region',
  'setup',
  'status',
  'sync',
  'ls',
  'list',
  'rm',
  'remove',
  'doctor',
  'exec',
  'provider',
  'ui',
  'help',
  'version',
]);

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function assertValidName(kind: 'alias' | 'source', name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new CloudhopError(
      'INVALID_NAME',
      `Invalid ${kind} name "${name}".`,
      'Use lowercase letters, numbers, "-" or "_" (max 63 characters).',
    );
  }
  if (kind === 'alias' && RESERVED_NAMES.has(name)) {
    throw new CloudhopError(
      'INVALID_NAME',
      `"${name}" is a cloudhop command.`,
      'Pick another alias name.',
    );
  }
}

/** Turns "Acme Prod" + "AdminAccess" into a valid alias suggestion like "acme-prod-admin". */
export function suggestAliasName(...parts: string[]): string {
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/access$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug || 'alias';
}

const slugTokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/access$/i, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Short forms for common role words, so `AdministratorAccess` becomes `admin`. */
const ROLE_WORDS: Record<string, string> = {
  administrator: 'admin',
  administratoraccess: 'admin',
  readonly: 'ro',
  readonlyaccess: 'ro',
  developer: 'dev',
  poweruser: 'power',
  poweruseraccess: 'power',
  viewonly: 'view',
};

/** Words that say nothing about which role it is. */
const ROLE_NOISE = new Set(['aws', 'access', 'role', 'ps', 'iam']);

const PRODUCTION = /(^|[^a-z])(prod|prd|production|live)([^a-z]|$)/i;

/** True when a name looks like production: "acme-prod", "Globex_Contoso_Prod_01", "live-eu". */
export const looksLikeProduction = (...texts: string[]): boolean =>
  texts.some((text) => PRODUCTION.test(text));

export interface NamingTarget {
  id: string;
  label: string;
  attributes: Record<string, string>;
}

/**
 * Short, unique alias suggestions for a source's targets: the account name
 * without the source's own prefix or trailing numbers ("Globex_Northwind_Prod_01"
 * in source "globex" → "northwind-prod"), plus a short role only when the same
 * account has several roles ("northwind-prod-support-ops").
 */
export function suggestAliases(
  targets: readonly NamingTarget[],
  sourceId: string,
  taken: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const sourceWords = new Set(
    slugTokens(sourceId).filter((w) => w.length > 2 && !/^(test|dev|main)$/.test(w)),
  );
  const accountOf = (t: NamingTarget) => {
    let words = slugTokens(t.attributes.accountName ?? t.label.split(' / ')[0] ?? t.id);
    if (words.length > 1 && sourceWords.has(words[0] as string)) words = words.slice(1);
    while (words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1] as string))
      words = words.slice(0, -1);
    return words;
  };
  const roleOf = (t: NamingTarget, accountWords: string[]) => {
    const raw = t.attributes.roleName ?? t.label.split(' / ')[1] ?? '';
    const compact = raw
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^aws/, '')
      .replace(/access$/, '');
    if (ROLE_WORDS[compact]) return [ROLE_WORDS[compact] as string];
    const skip = new Set([...accountWords, ...sourceWords, ...ROLE_NOISE]);
    const words = slugTokens(raw)
      .filter((w) => !skip.has(w))
      .map((w) => ROLE_WORDS[w] ?? w);
    return words.length ? words : slugTokens(raw).slice(-1);
  };

  const accounts = targets.map(accountOf);
  const count = new Map<string, number>();
  for (const words of accounts) count.set(words.join('-'), (count.get(words.join('-')) ?? 0) + 1);

  const used = new Set(taken);
  const result = new Map<string, string>();
  targets.forEach((target, i) => {
    const accountWords = accounts[i] as string[];
    const base = accountWords.join('-');
    const words =
      (count.get(base) ?? 0) > 1
        ? [...accountWords, ...roleOf(target, accountWords)]
        : accountWords;
    const stem = suggestAliasName(words.join('-'));
    let name = stem;
    for (let n = 2; used.has(name) || RESERVED_NAMES.has(name); n++) name = `${stem}-${n}`;
    used.add(name);
    result.set(target.id, name);
  });
  return result;
}
