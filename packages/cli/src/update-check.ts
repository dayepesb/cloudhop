import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareVersions } from '@cloudhop/core';

const DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = 'https://registry.npmjs.org/cloudhop/latest';

interface Cache {
  checkedAt: number;
  latest?: string;
}

/**
 * Tells the user when a newer cloudhop is on npm. Reads only the latest
 * version number (no code, no instructions), at most once a day, and never
 * delays a command by more than a moment. Off in CI, without a terminal, or
 * with CLOUDHOP_NO_UPDATE_CHECK=1.
 */
export function startUpdateCheck(configDir: string, current: string): () => Promise<void> {
  const env = process.env;
  if (env.CLOUDHOP_NO_UPDATE_CHECK === '1' || env.CI || !process.stderr.isTTY)
    return async () => {};
  const file = join(configDir, 'update-check.json');

  const work = (async () => {
    let cache: Cache = { checkedAt: 0 };
    try {
      cache = JSON.parse(await readFile(file, 'utf8')) as Cache;
    } catch {}
    if (cache.latest && compareVersions(cache.latest, current) > 0) {
      process.stderr.write(
        `\x1b[2mcloudhop ›\x1b[22m cloudhop ${cache.latest} is available (you have ${current}): npm i -g cloudhop\n`,
      );
    }
    if (Date.now() - cache.checkedAt < DAY_MS) return;
    const response = await fetch(REGISTRY_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return;
    const { version } = (await response.json()) as { version?: string };
    if (typeof version !== 'string') return;
    await mkdir(configDir, { recursive: true });
    await writeFile(file, JSON.stringify({ checkedAt: Date.now(), latest: version }));
  })().catch(() => {});

  // Let the command finish first, then wait briefly for the check to save its result.
  return () => Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, 300))]);
}
