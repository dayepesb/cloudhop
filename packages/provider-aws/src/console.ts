import type { ProcessEnv } from '@cloudhop/core';
import type { Fetch } from './http';

/** Where a federated console sign-in sends the user back when the console session ends. */
const ISSUER = 'https://dayepesb.github.io/cloudhop/';

/** The sign-in and console hosts of each AWS partition. */
function partitionHosts(region: string | undefined) {
  if (region?.startsWith('cn-')) {
    return { signin: 'https://signin.amazonaws.cn', console: 'https://console.amazonaws.cn' };
  }
  if (region?.startsWith('us-gov-')) {
    return {
      signin: 'https://signin.amazonaws-us-gov.com',
      console: 'https://console.amazonaws-us-gov.com',
    };
  }
  return { signin: 'https://signin.aws.amazon.com', console: 'https://console.aws.amazon.com' };
}

/** The console page to land on: a service's home, or the console home. */
export function consoleDestination(region: string | undefined, service?: string): string {
  const { console } = partitionHosts(region);
  const path = service ? `${service}/home` : 'console/home';
  return `${console}/${path}${region ? `?region=${encodeURIComponent(region)}` : ''}`;
}

/**
 * Exchanges temporary credentials for a console sign-in URL through the AWS
 * sign-in federation endpoint (the "custom identity broker" flow). Returns
 * undefined when AWS doesn't accept these credentials. The URL is a secret
 * for 15 minutes: callers open it and never print or log it.
 */
export async function federatedConsoleUrl(
  credentials: ProcessEnv,
  destination: string,
  region: string | undefined,
  fetchFn: Fetch,
): Promise<string | undefined> {
  const {
    AWS_ACCESS_KEY_ID: id,
    AWS_SECRET_ACCESS_KEY: key,
    AWS_SESSION_TOKEN: token,
  } = credentials;
  if (!id || !key || !token) return undefined;
  const { signin } = partitionHosts(region);
  // POST keeps the credentials out of the URL; no SessionDuration, so the
  // console session simply lasts as long as these credentials.
  const response = await fetchFn(`${signin}/federation`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      Action: 'getSigninToken',
      Session: JSON.stringify({ sessionId: id, sessionKey: key, sessionToken: token }),
    }).toString(),
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const signinToken = ((await response.json().catch(() => ({}))) as { SigninToken?: string })
    .SigninToken;
  if (!signinToken) return undefined;
  const params = new URLSearchParams({
    Action: 'login',
    Issuer: ISSUER,
    Destination: destination,
    SigninToken: signinToken,
  });
  return `${signin}/federation?${params}`;
}

/**
 * The IAM Identity Center "shortcut link": opens the account and role through
 * the access portal (needs the portal's browser session). The fallback when
 * federation is refused.
 */
export function portalShortcutUrl(
  startUrl: string,
  accountId: string,
  roleName: string,
  destination: string,
): string {
  const params = new URLSearchParams({ account_id: accountId, role_name: roleName, destination });
  return `${startUrl.replace(/\/+$/, '')}/#/console?${params}`;
}
