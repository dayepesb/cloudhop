export type ProviderId = 'aws' | 'azure' | 'gcp';

export const PROVIDER_IDS: readonly ProviderId[] = ['aws', 'azure', 'gcp'];

/** Somewhere you log in once: an SSO portal, a personal account, an Azure tenant... */
export interface Source {
  id: string;
  provider: ProviderId;
  /** Provider-specific flavour, e.g. `sso` or `console-login` for AWS. */
  kind: string;
  /** Provider-specific settings, e.g. `startUrl` and `region`. Never secrets. */
  settings: Record<string, string>;
}

/** An identity you can act as inside a source, e.g. an AWS account + role. */
export interface Target {
  id: string;
  label: string;
  attributes: Record<string, string>;
}

/** Your short name for source + target + region. */
export interface Alias {
  name: string;
  source: string;
  target: string;
  region?: string;
  /** Production: shown in red and protected against accidental changes. */
  prod?: boolean;
}

export interface Config {
  providers: ProviderId[];
  sources: Source[];
  aliases: Alias[];
}

export type SessionState = 'valid' | 'refreshable' | 'expired' | 'unknown';

export interface ResolvedAlias {
  alias: Alias;
  source: Source;
  /** Undefined when the target disappeared from the source since the last sync. */
  target: Target | undefined;
  region: string | undefined;
}

export const emptyConfig = (): Config => ({ providers: [], sources: [], aliases: [] });
