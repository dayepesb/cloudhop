import { join } from 'node:path';
import {
  CloudhopError,
  type CloudProvider,
  type EnvMode,
  type LoginInteraction,
  type ProcessEnv,
  type ProcessRunner,
  type ResolvedAlias,
  type SessionState,
  type Source,
  type SourceKind,
  type Target,
} from '@cloudhop/core';
import { type IniSection, writeManagedBlock } from './aws-config';
import type { Fetch } from './http';
import { PortalClient } from './sso/portal';
import { refreshSsoToken, ssoLogin } from './sso/sso-login';
import { readToken, tokenState, writeToken } from './sso/token-cache';

export interface AwsProviderOptions {
  /** Usually ~/.aws */
  awsDir: string;
  runner: ProcessRunner;
  fetchFn?: Fetch;
  /** Use the device code flow instead of the local browser redirect. */
  preferDeviceCode?: () => boolean;
}

/** Partition prefix, a compass direction, a number: us-east-1, ap-southeast-2, us-gov-west-1. */
const REGION_PATTERN =
  /^[a-z]{2}(-gov|-iso[a-z]?)?-(north|south|east|west|central)(east|west)?-\d{1,2}$/;
const validateRegion = (value: string) =>
  REGION_PATTERN.test(value) ? undefined : 'Use an AWS region like us-east-1.';

const CREDENTIAL_VARS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];

/** Messages from the AWS CLI and SDKs that mean "log in again". */
const SESSION_ERROR_PATTERNS = [
  /ExpiredToken/i,
  /token (has|is) expired/i,
  /session .* (has )?expired/i,
  /Error loading SSO Token/i,
  /Error when retrieving token from sso/i,
  /UnauthorizedSSOTokenError/i,
  /Unable to locate credentials/i,
  /run .?aws (sso )?login/i,
];

export const SSO_KIND = 'sso';
export const CONSOLE_LOGIN_KIND = 'console-login';
const CONSOLE_TARGET: Target = { id: 'console', label: 'Console sign-in', attributes: {} };

/** Name of the [sso-session] section for a source. */
export const ssoSessionName = (sourceId: string) => `cloudhop-${sourceId}`;
/** Profile `aws login` manages for a personal-account source. */
export const consoleProfileName = (sourceId: string) => `cloudhop-${sourceId}`;

export class AwsProvider implements CloudProvider {
  readonly id = 'aws' as const;
  readonly displayName = 'AWS';
  readonly cli = { command: 'aws', displayName: 'AWS CLI v2', minVersion: '2.32.0' };
  readonly identityArgs = ['sts', 'get-caller-identity'];
  readonly sourceKinds: readonly SourceKind[] = [
    {
      kind: SSO_KIND,
      label: 'IAM Identity Center (SSO portal)',
      hint: 'Company portals like https://my-company.awsapps.com/start',
      nameLabel: 'Short name for this organization / SSO portal',
      fields: [
        {
          key: 'startUrl',
          label: 'Start URL',
          placeholder: 'https://my-company.awsapps.com/start',
          validate: (v) =>
            /^https:\/\/\S+$/.test(v) ? undefined : 'Use the https:// start URL of the portal.',
        },
        { key: 'region', label: 'SSO region', defaultValue: 'us-east-1', validate: validateRegion },
      ],
    },
    {
      kind: CONSOLE_LOGIN_KIND,
      label: 'Personal account (aws login)',
      hint: 'Your console user or root. No access keys, nothing to enable.',
      nameLabel: 'Short name for this personal account',
      fields: [
        {
          key: 'region',
          label: 'Default region',
          defaultValue: 'us-east-1',
          validate: validateRegion,
        },
      ],
    },
  ];

  private readonly fetchFn: Fetch;

  constructor(private readonly options: AwsProviderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async sessionState(source: Source): Promise<SessionState> {
    if (source.kind === CONSOLE_LOGIN_KIND) return 'unknown';
    return tokenState(await readToken(this.options.awsDir, ssoSessionName(source.id)));
  }

  async refreshSession(source: Source): Promise<boolean> {
    if (source.kind === CONSOLE_LOGIN_KIND) return false;
    const name = ssoSessionName(source.id);
    const token = await readToken(this.options.awsDir, name);
    const refreshed = token && (await refreshSsoToken(token, this.fetchFn));
    if (!refreshed) return false;
    await writeToken(this.options.awsDir, name, refreshed);
    return true;
  }

  async login(source: Source, interaction: LoginInteraction): Promise<void> {
    if (source.kind === CONSOLE_LOGIN_KIND) {
      const args = ['login', '--profile', consoleProfileName(source.id)];
      if (source.settings.region) args.push('--region', source.settings.region);
      const { exitCode } = await this.options.runner.run('aws', args);
      if (exitCode !== 0)
        throw new CloudhopError('LOGIN_FAILED', `\`aws login\` failed for ${source.id}.`);
      return;
    }
    const token = await ssoLogin({
      startUrl: this.setting(source, 'startUrl'),
      region: this.setting(source, 'region'),
      fetchFn: this.fetchFn,
      interaction,
      deviceCode: this.options.preferDeviceCode?.() ?? false,
    });
    await writeToken(this.options.awsDir, ssoSessionName(source.id), token);
  }

  async discoverTargets(source: Source): Promise<Target[]> {
    if (source.kind === CONSOLE_LOGIN_KIND) return [CONSOLE_TARGET];
    const portal = await this.portal(source);
    const accounts = await portal.listAccounts();
    const targets: Target[] = [];
    // A few accounts at a time: fast, without hitting the portal's rate limits.
    for (let i = 0; i < accounts.length; i += 5) {
      const batch = accounts.slice(i, i + 5);
      const roles = await Promise.all(batch.map((a) => portal.listAccountRoles(a.accountId)));
      batch.forEach((account, index) => {
        for (const role of roles[index] ?? []) {
          const accountName = account.accountName ?? account.accountId;
          targets.push({
            id: `${account.accountId}/${role.roleName}`,
            label: `${accountName} / ${role.roleName}`,
            attributes: { accountId: account.accountId, accountName, roleName: role.roleName },
          });
        }
      });
    }
    return targets.sort((a, b) => a.label.localeCompare(b.label));
  }

  async syncProfiles(sources: readonly Source[], aliases: readonly ResolvedAlias[]): Promise<void> {
    const sections: IniSection[] = [];
    for (const source of sources.filter((s) => s.kind === SSO_KIND)) {
      sections.push({
        header: `sso-session ${ssoSessionName(source.id)}`,
        values: {
          sso_start_url: this.setting(source, 'startUrl'),
          sso_region: this.setting(source, 'region'),
          sso_registration_scopes: 'sso:account:access',
        },
      });
    }
    for (const { alias, source, target, region } of aliases) {
      if (source.kind !== SSO_KIND || !target) continue;
      sections.push({
        header: `profile ${alias.name}`,
        values: {
          sso_session: ssoSessionName(source.id),
          sso_account_id: target.attributes.accountId ?? '',
          sso_role_name: target.attributes.roleName ?? '',
          ...(region ? { region } : {}),
        },
      });
    }
    await writeManagedBlock(join(this.options.awsDir, 'config'), sections);
  }

  async processEnv(resolved: ResolvedAlias, mode: EnvMode): Promise<ProcessEnv> {
    const region = resolved.region;
    const regionEnv: ProcessEnv = region ? { AWS_REGION: region, AWS_DEFAULT_REGION: region } : {};
    const profile =
      resolved.source.kind === CONSOLE_LOGIN_KIND
        ? consoleProfileName(resolved.source.id)
        : resolved.alias.name;

    if (mode === 'cli') {
      // Inherited static keys would win over the profile, so drop them.
      return {
        ...Object.fromEntries(CREDENTIAL_VARS.map((k) => [k, undefined])),
        AWS_PROFILE: profile,
        ...regionEnv,
      };
    }
    const credentials =
      resolved.source.kind === CONSOLE_LOGIN_KIND
        ? await this.exportedCredentials(profile)
        : await this.roleCredentials(resolved);
    return { AWS_PROFILE: undefined, ...credentials, ...regionEnv };
  }

  isSessionError(output: string): boolean {
    return SESSION_ERROR_PATTERNS.some((pattern) => pattern.test(output));
  }

  private async roleCredentials(resolved: ResolvedAlias): Promise<ProcessEnv> {
    const portal = await this.portal(resolved.source);
    const attrs = resolved.target?.attributes ?? {};
    const creds = await portal.getRoleCredentials(attrs.accountId ?? '', attrs.roleName ?? '');
    return {
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
      AWS_SESSION_TOKEN: creds.sessionToken,
      AWS_CREDENTIAL_EXPIRATION: new Date(creds.expiration).toISOString(),
    };
  }

  /** `aws login` credentials can only be read through the CLI. */
  private async exportedCredentials(profile: string): Promise<ProcessEnv> {
    const { exitCode, stdout, stderr } = await this.options.runner.capture('aws', [
      'configure',
      'export-credentials',
      '--profile',
      profile,
      '--format',
      'process',
    ]);
    if (exitCode !== 0)
      throw new CloudhopError('LOGIN_FAILED', `Could not read credentials: ${stderr.trim()}`);
    const creds = JSON.parse(stdout) as Record<string, string>;
    return {
      AWS_ACCESS_KEY_ID: creds.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
      AWS_SESSION_TOKEN: creds.SessionToken,
      AWS_CREDENTIAL_EXPIRATION: creds.Expiration,
    };
  }

  private async portal(source: Source): Promise<PortalClient> {
    const token = await readToken(this.options.awsDir, ssoSessionName(source.id));
    if (!token) throw new CloudhopError('LOGIN_FAILED', `Not logged in to ${source.id}.`);
    return new PortalClient(this.setting(source, 'region'), token.accessToken, this.fetchFn);
  }

  private setting(source: Source, key: string): string {
    const value = source.settings[key];
    if (!value) throw new CloudhopError('SOURCE_NOT_FOUND', `Source "${source.id}" has no ${key}.`);
    return value;
  }
}
