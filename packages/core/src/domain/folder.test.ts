import { describe, expect, it } from 'vitest';
import { formatFolderFile, parseFolderFile } from './folder';

describe('parseFolderFile', () => {
  it('reads one alias per cloud, ignoring comments and blank lines', () => {
    expect(parseFolderFile('# team\naws: license-qa\n\ngcp = data-dev  # later\n')).toEqual({
      aws: 'license-qa',
      gcp: 'data-dev',
    });
  });

  it('accepts a bare alias name on its own', () => {
    expect(parseFolderFile('license-qa\r\n')).toEqual({ any: 'license-qa' });
  });

  it('rejects unknown clouds, repeated clouds, bad names and empty files', () => {
    expect(() => parseFolderFile('oracle: x')).toThrow(/unknown cloud/);
    expect(() => parseFolderFile('aws: a\naws: b')).toThrow(/twice/);
    expect(() => parseFolderFile('aws: $(rm -rf ~)')).toThrow();
    expect(() => parseFolderFile('aws: use')).toThrow(/cloudhop command/);
    expect(() => parseFolderFile('# nothing\n')).toThrow(/names no alias/);
  });

  it('round-trips through formatFolderFile', () => {
    const aliases = { aws: 'license-qa', azure: 'sub-dev' };
    expect(parseFolderFile(formatFolderFile(aliases))).toEqual(aliases);
  });
});
