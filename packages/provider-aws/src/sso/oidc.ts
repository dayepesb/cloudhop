import { type Fetch, postJson } from '../http';

/** IAM Identity Center OIDC API (https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/). */

export const SSO_SCOPES = ['sso:account:access'];
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
/** Loopback redirect registered with the client; the port is chosen at login time (RFC 8252). */
export const REGISTERED_REDIRECT = 'http://127.0.0.1/oauth/callback';

export interface ClientRegistration {
  clientId: string;
  clientSecret: string;
  /** Epoch seconds. */
  clientSecretExpiresAt: number;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval?: number;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export class OidcClient {
  private readonly endpoint: string;

  constructor(
    region: string,
    private readonly fetchFn: Fetch,
  ) {
    this.endpoint = `https://oidc.${region}.amazonaws.com`;
  }

  registerForAuthorizationCode(startUrl: string): Promise<ClientRegistration> {
    return postJson(this.fetchFn, `${this.endpoint}/client/register`, {
      clientName: 'cloudhop',
      clientType: 'public',
      scopes: SSO_SCOPES,
      grantTypes: ['authorization_code', 'refresh_token'],
      redirectUris: [REGISTERED_REDIRECT],
      issuerUrl: startUrl,
    });
  }

  registerForDeviceCode(): Promise<ClientRegistration> {
    return postJson(this.fetchFn, `${this.endpoint}/client/register`, {
      clientName: 'cloudhop',
      clientType: 'public',
      scopes: SSO_SCOPES,
    });
  }

  authorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      state: params.state,
      code_challenge_method: 'S256',
      scopes: SSO_SCOPES.join(' '),
      code_challenge: params.codeChallenge,
    });
    return `${this.endpoint}/authorize?${query}`;
  }

  startDeviceAuthorization(
    client: ClientRegistration,
    startUrl: string,
  ): Promise<DeviceAuthorization> {
    return postJson(this.fetchFn, `${this.endpoint}/device_authorization`, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      startUrl,
    });
  }

  exchangeCode(
    client: ClientRegistration,
    params: { code: string; codeVerifier: string; redirectUri: string },
  ): Promise<TokenResponse> {
    return postJson(this.fetchFn, `${this.endpoint}/token`, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      grantType: 'authorization_code',
      ...params,
    });
  }

  exchangeDeviceCode(client: ClientRegistration, deviceCode: string): Promise<TokenResponse> {
    return postJson(this.fetchFn, `${this.endpoint}/token`, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      grantType: DEVICE_GRANT,
      deviceCode,
    });
  }

  refresh(
    client: { clientId: string; clientSecret: string },
    refreshToken: string,
  ): Promise<TokenResponse> {
    return postJson(this.fetchFn, `${this.endpoint}/token`, {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      grantType: 'refresh_token',
      refreshToken,
    });
  }
}
