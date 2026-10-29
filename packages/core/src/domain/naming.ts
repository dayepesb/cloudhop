import { CloudhopError } from './errors';

/** Words the CLI uses as commands, so they can't be alias names. */
export const RESERVED_NAMES = new Set([
  'add',
  'alias',
  'login',
  'region',
  'setup',
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
