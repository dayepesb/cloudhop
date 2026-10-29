import { describe, expect, it } from 'vitest';
import { BLOCK_END, BLOCK_START, type IniSection, replaceManagedBlock } from './aws-config';

const sections: IniSection[] = [
  {
    header: 'sso-session cloudhop-acme',
    values: { sso_start_url: 'https://acme.awsapps.com/start' },
  },
  { header: 'profile acme-prod', values: { sso_session: 'cloudhop-acme', region: 'us-east-1' } },
];

describe('replaceManagedBlock', () => {
  it('appends the block after the user content', () => {
    const result = replaceManagedBlock('[default]\nregion = us-east-1\n', sections);
    expect(result).toBe(
      `[default]\nregion = us-east-1\n\n${BLOCK_START}\n[sso-session cloudhop-acme]\nsso_start_url = https://acme.awsapps.com/start\n\n[profile acme-prod]\nsso_session = cloudhop-acme\nregion = us-east-1\n${BLOCK_END}\n`,
    );
  });

  it('replaces an existing block and keeps what comes after it', () => {
    const first = replaceManagedBlock('[default]\n', sections);
    const withTail = `${first}\n[profile cloudhop-personal]\nlogin_session = arn:aws:iam::1:user/me\n`;
    const result = replaceManagedBlock(withTail, sections.slice(0, 1));
    expect(result).not.toContain('[profile acme-prod]');
    expect(result).toContain('[sso-session cloudhop-acme]');
    expect(result).toContain('login_session = arn:aws:iam::1:user/me');
    expect(result.match(/cloudhop managed >>>/g)).toHaveLength(1);
  });

  it('removes the block when nothing is managed', () => {
    const first = replaceManagedBlock('[default]\n', sections);
    expect(replaceManagedBlock(first, [])).toBe('[default]\n');
  });

  it('leaves untouched files alone', () => {
    expect(replaceManagedBlock('[default]\n\n\n', [])).toBe('[default]\n\n\n');
  });

  it('refuses to shadow a hand-written profile', () => {
    expect(() => replaceManagedBlock('[profile   acme-prod]\nregion = x\n', sections)).toThrow(
      /outside cloudhop/,
    );
  });
});
