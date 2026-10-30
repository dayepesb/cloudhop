import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { FOLDER_FILE } from '@cloudhop/core';

/** The nearest `.cloudhoprc` from `start` up to the root. */
export function findFolderFile(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const file = join(dir, FOLDER_FILE);
    try {
      if (statSync(file).isFile()) return file;
    } catch {
      // Not here: keep going up.
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** One key per file, however it was reached (symlinks, /var vs /private/var on macOS). */
const key = (path: string) => {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
};

const digest = (content: string) => createHash('sha256').update(content).digest('hex');

interface TrustFile {
  version: 1;
  /** Absolute path → sha256 of the content the user approved. */
  files: Record<string, string>;
}

/**
 * Folder files the user approved with `cloudhop allow`: a cloned repository
 * can't switch your account until you trust its `.cloudhoprc`, and any later
 * change to the file needs a new approval.
 */
export class TrustedFolders {
  private readonly file: string;

  constructor(configDir: string) {
    this.file = join(configDir, 'trusted-folders.json');
  }

  isTrusted(path: string, content: string): boolean {
    return this.load().files[key(path)] === digest(content);
  }

  async trust(path: string, content: string): Promise<void> {
    const data = this.load();
    data.files[key(path)] = digest(content);
    await this.save(data);
  }

  /** Returns false when the file was not trusted. */
  async forget(path: string): Promise<boolean> {
    const data = this.load();
    const file = key(path);
    if (!(file in data.files)) return false;
    delete data.files[file];
    await this.save(data);
    return true;
  }

  private load(): TrustFile {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as TrustFile;
      return data?.version === 1 && data.files ? data : { version: 1, files: {} };
    } catch {
      return { version: 1, files: {} };
    }
  }

  private async save(data: TrustFile): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }
}

/** Reads a folder file, or undefined when it is gone. */
export async function readFolderFile(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch(() => undefined);
}
