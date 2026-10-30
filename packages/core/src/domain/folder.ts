import { CloudhopError } from './errors';
import { PROVIDER_IDS, type ProviderId } from './model';
import { assertValidName } from './naming';

/** The file that pins aliases to a folder: the shell switches to them on `cd`. */
export const FOLDER_FILE = '.cloudhoprc';

/** The aliases a folder file asks for: one per cloud, or `any` for a bare alias name. */
export type FolderAliases = Partial<Record<ProviderId | 'any', string>>;

const bad = (why: string) =>
  new CloudhopError(
    'INVALID_NAME',
    `Not a valid ${FOLDER_FILE}: ${why}.`,
    'Write one line per cloud, like `aws: my-alias`.',
  );

/**
 * Parses a `.cloudhoprc`: `aws: license-api-qa` lines (one per cloud),
 * `#` comments, or just an alias name on its own.
 */
export function parseFolderFile(text: string): FolderAliases {
  const result: FolderAliases = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const match = /^([a-z]+)\s*[:=]\s*(\S+)$/.exec(line);
    const key = (match ? match[1] : 'any') as ProviderId | 'any';
    const alias = match ? (match[2] as string) : line;
    if (key !== 'any' && !PROVIDER_IDS.includes(key)) throw bad(`unknown cloud "${key}"`);
    if (result[key]) throw bad(`"${key}" appears twice`);
    assertValidName('alias', alias);
    result[key] = alias;
  }
  if (Object.keys(result).length === 0) throw bad('it names no alias');
  return result;
}

/** Writes the aliases back in the `aws: alias` form. */
export function formatFolderFile(aliases: FolderAliases): string {
  const lines = Object.entries(aliases).map(([key, alias]) =>
    key === 'any' ? alias : `${key}: ${alias}`,
  );
  return `# cloudhop: aliases for this folder (https://dayepesb.github.io/cloudhop/guides/shell/)\n${lines.join('\n')}\n`;
}
