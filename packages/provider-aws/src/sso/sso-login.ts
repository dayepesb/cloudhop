import { createHash, randomBytes } from 'node:crypto';
import { CloudhopError, type LoginInteraction } from '@cloudhop/core';
import type { Fetch } from '../http';
import { AwsHttpError } from '../http';
import { startLoopbackServer } from './loopback';
import { type ClientRegistration, OidcClient, type TokenResponse } from './oidc';
import { type CachedToken, isoSeconds } from './token-cache';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface SsoLoginOptions {
  startUrl: string;
  region: string;
  fetchFn: Fetch;
  interaction: LoginInteraction;
  /** Use the device code flow (for machines without a local browser, e.g. over SSH). */
  deviceCode?: boolean;
}

const base64url = (buffer: Buffer) => buffer.toString('base64url');

function toCachedToken(
  options: SsoLoginOptions,
  client: ClientRegistration,
  token: TokenResponse,
): CachedToken {
  return {
    startUrl: options.startUrl,
    region: options.region,
    accessToken: token.accessToken,
    expiresAt: isoSeconds(Date.now() + token.expiresIn * 1000),
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    registrationExpiresAt: isoSeconds(client.clientSecretExpiresAt * 1000),
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
  };
}

/** Browser login with PKCE: one click in the browser, nothing to copy. */
async function authorizationCodeLogin(options: SsoLoginOptions): Promise<CachedToken> {
  const oidc = new OidcClient(options.region, options.fetchFn);
  const client = await oidc.registerForAuthorizationCode(options.startUrl);
  const server = await startLoopbackServer();
  try {
    const codeVerifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    const url = oidc.authorizeUrl({
      clientId: client.clientId,
      redirectUri: server.redirectUri,
      state,
      codeChallenge: base64url(createHash('sha256').update(codeVerifier).digest()),
    });
    options.interaction.notify('Opening your browser to log in…');
    options.interaction.notify(`If it doesn't open, visit: ${url}`);
    await options.interaction.openBrowser(url);
    const code = await server.waitForCode(state, LOGIN_TIMEOUT_MS);
    const token = await oidc.exchangeCode(client, {
      code,
      codeVerifier,
      redirectUri: server.redirectUri,
    });
    return toCachedToken(options, client, token);
  } finally {
    server.close();
  }
}

/** Device code login: shows a code to confirm in any browser. */
async function deviceCodeLogin(options: SsoLoginOptions): Promise<CachedToken> {
  const oidc = new OidcClient(options.region, options.fetchFn);
  const client = await oidc.registerForDeviceCode();
  const device = await oidc.startDeviceAuthorization(client, options.startUrl);
  options.interaction.notify(`Confirm this code in the browser: ${device.userCode}`);
  options.interaction.notify(`If it doesn't open, visit: ${device.verificationUriComplete}`);
  await options.interaction.openBrowser(device.verificationUriComplete);

  let intervalMs = (device.interval ?? 5) * 1000;
  const deadline = Date.now() + device.expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      return toCachedToken(
        options,
        client,
        await oidc.exchangeDeviceCode(client, device.deviceCode),
      );
    } catch (error) {
      if (error instanceof AwsHttpError && error.code?.includes('AuthorizationPending')) continue;
      if (error instanceof AwsHttpError && error.code === 'authorization_pending') continue;
      if (error instanceof AwsHttpError && /slow_?down/i.test(error.code ?? '')) {
        intervalMs += 5000;
        continue;
      }
      throw error;
    }
  }
  throw new Error('The device code expired before the login was confirmed.');
}

export async function ssoLogin(options: SsoLoginOptions): Promise<CachedToken> {
  try {
    return options.deviceCode
      ? await deviceCodeLogin(options)
      : await authorizationCodeLogin(options);
  } catch (error) {
    if (error instanceof CloudhopError) throw error;
    const message = (error as Error).message;
    throw new CloudhopError(
      'LOGIN_FAILED',
      `Could not log in to ${options.startUrl}: ${message}`,
      /invalid start ?url/i.test(message)
        ? 'Check the start URL. It looks like https://<your-company>.awsapps.com/start; copy it from the AWS access portal.'
        : options.deviceCode
          ? undefined
          : 'Try again with `--device-code` if the browser cannot reach this machine.',
    );
  }
}

export async function refreshSsoToken(
  token: CachedToken,
  fetchFn: Fetch,
): Promise<CachedToken | undefined> {
  if (!token.refreshToken || !token.clientId || !token.clientSecret) return undefined;
  try {
    const oidc = new OidcClient(token.region, fetchFn);
    const refreshed = await oidc.refresh(
      { clientId: token.clientId, clientSecret: token.clientSecret },
      token.refreshToken,
    );
    return {
      ...token,
      accessToken: refreshed.accessToken,
      expiresAt: isoSeconds(Date.now() + refreshed.expiresIn * 1000),
      refreshToken: refreshed.refreshToken ?? token.refreshToken,
    };
  } catch {
    return undefined;
  }
}
