import { describe, expect, it } from 'vitest';
import { looksLikeProduction, suggestAliases } from './naming';

const t = (id: string, accountName: string, roleName: string) => ({
  id,
  label: `${accountName} / ${roleName}`,
  attributes: { accountName, roleName },
});

describe('suggestAliases', () => {
  it('keeps names short: no source prefix, no trailing numbers, role only when needed', () => {
    const names = suggestAliases(
      [
        t('1/support', 'Globex_Northwind_Prod_01', 'globex-prod-ps-support-ops'),
        t('2/support', 'Globex_Contoso_Prod_01', 'globex-prod-ps-support-ops'),
        t('2/admin', 'Globex_Contoso_Prod_01', 'AWSAdministratorAccess'),
        t('3/dev', 'Globex_Core_Dev', 'globex-dev-ps-backend-developer'),
      ],
      'globex-test',
    );
    expect([...names.values()]).toEqual([
      'northwind-prod',
      'contoso-prod-support-ops',
      'contoso-prod-admin',
      'core-dev',
    ]);
  });

  it('never collides with taken names or commands', () => {
    const names = suggestAliases(
      [t('1/a', 'status', 'ReadOnly'), t('2/a', 'acme-prod', 'Admin')],
      'x',
      new Set(['acme-prod']),
    );
    expect([...names.values()]).toEqual(['status-2', 'acme-prod-2']);
  });
});

describe('looksLikeProduction', () => {
  it('spots production words but not lookalikes', () => {
    expect(looksLikeProduction('acme-prod')).toBe(true);
    expect(looksLikeProduction('Globex_Contoso_Prod_01')).toBe(true);
    expect(looksLikeProduction('live-eu')).toBe(true);
    expect(looksLikeProduction('product-team', 'reproduce')).toBe(false);
  });
});
