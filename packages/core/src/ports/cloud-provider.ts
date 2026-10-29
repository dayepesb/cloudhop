import type { ProviderId, ResolvedAlias, SessionState, Source, Target } from '../domain/model';

/** A field the setup wizard asks for when adding a source. */
export interface SourceField {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

export interface SourceKind {
  kind: string;
  label: string;
  hint?: string;
  /** How to ask for the source's short name, e.g. "Name for this organization". */
  nameLabel?: string;
  fields: SourceField[];
}

/** What a provider may ask of the outside world while logging in. */
export interface LoginInteraction {
  openBrowser(url: string): Promise<void>;
  /** Shows a short message, e.g. a device code to confirm in the browser. */
  notify(message: string): void;
}

/** Variables to set on the child process; `undefined` removes an inherited variable. */
export type ProcessEnv = Record<string, string | undefined>;

/**
 * - `cli`: environment for running the provider's own CLI (profile names, region).
 * - `credentials`: raw temporary credentials, for tools that don't know the CLI's profiles.
 */
export type EnvMode = 'cli' | 'credentials';

export interface CliRequirement {
  command: string;
  displayName: string;
  /** Minimum version known to work, compared with `ToolInfo.version`. */
  minVersion?: string;
}

export interface CloudProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly cli: CliRequirement;
  readonly sourceKinds: readonly SourceKind[];

  sessionState(source: Source): Promise<SessionState>;
  /** Renews the session without user interaction. Returns false when that isn't possible. */
  refreshSession(source: Source): Promise<boolean>;
  login(source: Source, interaction: LoginInteraction): Promise<void>;
  discoverTargets(source: Source): Promise<Target[]>;
  /** Writes whatever the provider's CLI needs to find the aliases (e.g. ~/.aws/config profiles). */
  syncProfiles(sources: readonly Source[], aliases: readonly ResolvedAlias[]): Promise<void>;
  processEnv(alias: ResolvedAlias, mode: EnvMode): Promise<ProcessEnv>;
  /** True when CLI output means the session expired and logging in again should fix it. */
  isSessionError(output: string): boolean;
}
