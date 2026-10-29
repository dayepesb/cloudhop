import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CloudhopError } from '@cloudhop/core';

export const BLOCK_START = '# >>> cloudhop managed >>> (edit with `cloudhop`, not by hand)';
export const BLOCK_END = '# <<< cloudhop managed <<<';

export interface IniSection {
  /** Full header without brackets, e.g. `profile acme-prod` or `sso-session cloudhop-acme`. */
  header: string;
  values: Record<string, string>;
}

export function renderBlock(sections: readonly IniSection[]): string {
  const body = sections
    .map((s) =>
      [`[${s.header}]`, ...Object.entries(s.values).map(([k, v]) => `${k} = ${v}`)].join('\n'),
    )
    .join('\n\n');
  return `${BLOCK_START}\n${body}${body ? '\n' : ''}${BLOCK_END}\n`;
}

/** Splits ~/.aws/config into what cloudhop manages and what the user wrote. */
export function splitManaged(content: string): { before: string; after: string } {
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return { before: content, after: '' };
  return {
    before: content.slice(0, start),
    after: content.slice(end + BLOCK_END.length).replace(/^\n/, ''),
  };
}

/** Section headers (normalised whitespace) defined outside the managed block. */
export function unmanagedHeaders(content: string): Set<string> {
  const { before, after } = splitManaged(content);
  const headers = new Set<string>();
  for (const match of `${before}\n${after}`.matchAll(/^\s*\[([^\]]+)\]/gm)) {
    headers.add((match[1] ?? '').trim().replace(/\s+/g, ' '));
  }
  return headers;
}

export function replaceManagedBlock(content: string, sections: readonly IniSection[]): string {
  const conflicts = sections.map((s) => s.header).filter((h) => unmanagedHeaders(content).has(h));
  if (conflicts.length > 0) {
    throw new CloudhopError(
      'ALIAS_EXISTS',
      `~/.aws/config already defines [${conflicts.join('], [')}] outside cloudhop.`,
      'Pick another alias name, or remove/rename that profile.',
    );
  }

  if (sections.length === 0 && !content.includes(BLOCK_START)) return content;

  const { before, after } = splitManaged(content);
  const block = sections.length > 0 ? renderBlock(sections) : '';
  const head = before.trimEnd();
  return [head, block.trimEnd(), after.trimEnd()].filter(Boolean).join('\n\n') + '\n';
}

export async function writeManagedBlock(
  path: string,
  sections: readonly IniSection[],
): Promise<void> {
  let content = '';
  try {
    content = await readFile(path, 'utf8');
  } catch {
    // No config yet.
  }
  const next = replaceManagedBlock(content, sections);
  if (next === content) return;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, next, { mode: 0o600 });
}
