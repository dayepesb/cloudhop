import type { AliasStatus } from '@cloudhop/core';
import { describe, expect, it } from 'vitest';
import { selectAliases } from './each';

const alias = (name: string, source = 'acme', prod = false) =>
  ({ name, source, prod }) as unknown as AliasStatus;
const all = [
  alias('creci-qa'),
  alias('creci-prod', 'acme', true),
  alias('globex-contoso', 'globex', true),
  alias('globex-core', 'globex'),
];
const names = (list: AliasStatus[]) => list.map((a) => a.name);

describe('selectAliases', () => {
  it('takes names, comma lists, wildcards and regular expressions', () => {
    expect(names(selectAliases(all, ['creci-qa,globex-core'], {}))).toEqual([
      'creci-qa',
      'globex-core',
    ]);
    expect(names(selectAliases(all, ['globex-*'], {}))).toEqual(['globex-contoso', 'globex-core']);
    expect(names(selectAliases(all, ['/^creci-(qa|prod)$/'], {}))).toEqual([
      'creci-qa',
      'creci-prod',
    ]);
  });

  it('filters by source and production', () => {
    expect(names(selectAliases(all, [], { source: 'globex' }))).toEqual([
      'globex-contoso',
      'globex-core',
    ]);
    expect(names(selectAliases(all, ['*'], { prod: false }))).toEqual(['creci-qa', 'globex-core']);
  });

  it('complains about names that do not exist', () => {
    expect(() => selectAliases(all, ['nope'], {})).toThrow(/not found/);
    expect(() => selectAliases(all, ['/(/'], {})).toThrow(/Invalid regular expression/);
  });
});
