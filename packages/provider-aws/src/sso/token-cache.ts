import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionState } from '@cloudhop/core';

/**
 * SSO token in the AWS CLI cache format (~/.aws/sso/cache/<sha1(session name)>.json),
 * so `aws`, SDKs and cloudhop share one login.
 */
export interface CachedToken {
  startUrl: string;
  region: string;
  accessToken: string;
  /** ISO 8601, e.g. 2026-10-29T08:00:00Z */
  expiresAt: string;
  clientId?: string;
  clientSecret?: string;
  /** ISO 8601 */
  registrationExpiresAt?: string;
  refreshToken?: string;
}

/** Tokens this close to expiring are treated as expired. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export function tokenCachePath(awsDir: string, sessionName: string): string {
  const hash = createHash('sha1').update(sessionName).digest('hex');
  return join(awsDir, 'sso', 'cache', `${hash}.json`);
}

export async function readToken(
  awsDir: string,
  sessionName: string,
): Promise<CachedToken | undefined> {
  try {
    return JSON.parse(await readFile(tokenCachePath(awsDir, sessionName), 'utf8')) as CachedToken;
  } catch {
    return undefined;
  }
}

export async function writeToken(
  awsDir: string,
  sessionName: string,
  token: CachedToken,
): Promise<void> {
  await mkdir(join(awsDir, 'sso', 'cache'), { recursive: true, mode: 0o700 });
  await writeFile(tokenCachePath(awsDir, sessionName), JSON.stringify(token, null, 2), {
    mode: 0o600,
  });
}

export function tokenState(token: CachedToken | undefined, now = Date.now()): SessionState {
  if (!token) return 'expired';
  if (Date.parse(token.expiresAt) - EXPIRY_MARGIN_MS > now) return 'valid';
  const registrationValid =
    !token.registrationExpiresAt || Date.parse(token.registrationExpiresAt) > now;
  if (token.refreshToken && token.clientId && token.clientSecret && registrationValid) {
    return 'refreshable';
  }
  return 'expired';
}

/** Formats a date the way the AWS CLI does (no milliseconds). */
export function isoSeconds(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
