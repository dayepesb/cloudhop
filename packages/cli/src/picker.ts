import { type CloudhopApp, CloudhopError } from '@cloudhop/core';
import { interactive } from './flags';
import { answer, p, paint } from './ui';

/**
 * Fuzzy alias picker: every word typed must appear somewhere in the alias,
 * its account/role or region, in any order ("creci q" finds creci-qa).
 */
export async function pickAlias(app: CloudhopApp, message = 'Which alias?'): Promise<string> {
  if (!interactive()) {
    throw new CloudhopError(
      'NOT_INTERACTIVE',
      'Say which alias to use.',
      'See them with `cloudhop ls`.',
    );
  }
  const { aliases } = await app.overview();
  if (aliases.length === 0) {
    throw new CloudhopError(
      'ALIAS_NOT_FOUND',
      'No aliases yet.',
      'Create one with `cloudhop alias <source>`.',
    );
  }
  const haystack = new Map(
    aliases.map((a) => [
      a.name,
      `${a.name} ${a.label ?? a.target} ${a.region ?? ''} ${a.source}`.toLowerCase(),
    ]),
  );
  return answer(
    await p.autocomplete<string>({
      message: `${message} ${paint('dim', '(type to filter)')}`,
      maxItems: 12,
      options: aliases.map((a) => ({
        value: a.name,
        label: a.prod ? `${a.name} ${paint('red', 'PROD')}` : a.name,
        hint: `${a.label ?? a.target} · ${a.region ?? 'no region'}`,
      })),
      filter: (search, option) => {
        const text = haystack.get(option.value) ?? '';
        return search
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
          .every((word) => text.includes(word));
      },
    }),
  );
}
