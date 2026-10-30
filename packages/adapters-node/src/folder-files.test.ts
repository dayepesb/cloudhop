import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFolderFile, TrustedFolders } from './folder-files';

describe('findFolderFile', () => {
  it('finds the nearest .cloudhoprc going up, and nothing outside', () => {
    const root = mkdtempSync(join(tmpdir(), 'cloudhop-folder-'));
    const deep = join(root, 'repo', 'src', 'api');
    mkdirSync(deep, { recursive: true });
    expect(findFolderFile(deep)).toBeUndefined();
    writeFileSync(join(root, 'repo', '.cloudhoprc'), 'aws: a\n');
    expect(findFolderFile(deep)).toBe(join(root, 'repo', '.cloudhoprc'));
    writeFileSync(join(root, 'repo', 'src', '.cloudhoprc'), 'aws: b\n');
    expect(findFolderFile(deep)).toBe(join(root, 'repo', 'src', '.cloudhoprc'));
  });
});

describe('TrustedFolders', () => {
  it('trusts an exact content and asks again when the file changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloudhop-trust-'));
    const trusted = new TrustedFolders(dir);
    const file = join(dir, 'repo', '.cloudhoprc');
    expect(trusted.isTrusted(file, 'aws: a\n')).toBe(false);
    await trusted.trust(file, 'aws: a\n');
    expect(trusted.isTrusted(file, 'aws: a\n')).toBe(true);
    expect(trusted.isTrusted(file, 'aws: prod\n')).toBe(false);
    expect(await trusted.forget(file)).toBe(true);
    expect(trusted.isTrusted(file, 'aws: a\n')).toBe(false);
    expect(await trusted.forget(file)).toBe(false);
  });
});
