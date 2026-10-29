import { describe, expect, it } from 'vitest';
import { parseArgs } from './flags';

describe('parseArgs', () => {
  it('splits positionals and flags, camel-casing names', () => {
    expect(
      parseArgs(['aws', 'sso', '--start-url', 'https://x.awsapps.com/start', '--region=us-east-2']),
    ).toEqual({
      positional: ['aws', 'sso'],
      flags: { startUrl: 'https://x.awsapps.com/start', region: 'us-east-2' },
    });
  });

  it('does not consume the next argument for boolean flags', () => {
    expect(parseArgs(['--list', 'acme'])).toEqual({
      positional: ['acme'],
      flags: { list: 'true' },
    });
  });
});
