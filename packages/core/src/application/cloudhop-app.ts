import { CloudhopError } from '../domain/errors';
import type {
  Alias,
  Config,
  ProviderId,
  ResolvedAlias,
  SessionState,
  Source,
  Target,
} from '../domain/model';
import { assertValidName } from '../domain/naming';
import { compareVersions } from '../domain/version';
import type {
  CliRequirement,
  CloudProvider,
  ConsoleSignIn,
  EnvMode,
  ProcessEnv,
} from '../ports/cloud-provider';
import type { ConfigStore } from '../ports/config-store';
import type {
  BrowserOpener,
  CaptureResult,
  InstallRecipe,
  ProcessRunner,
  ToolInfo,
  ToolInstaller,
} from '../ports/system';

const loginRequired = (sourceId: string) =>
  new CloudhopError(
    'LOGIN_REQUIRED',
    `The session of "${sourceId}" expired and needs a browser sign-in.`,
    `Run \`cloudhop login ${sourceId}\` (it opens the browser), then try again.`,
  );

export interface CloudhopDeps {
  config: ConfigStore;
  /** Providers implemented in this build. Users choose which ones to enable. */
  providers: readonly CloudProvider[];
  runner: ProcessRunner;
  browser: BrowserOpener;
  installer: ToolInstaller;
  /** Progress messages for the user (login prompts, retries). */
  notify: (message: string) => void;
}

export type SessionAction = 'none' | 'refreshed' | 'logged-in';

export interface SyncReport {
  sourceId: string;
  targets: Target[];
  added: Target[];
  removed: Target[];
  /** Aliases whose target is no longer available in the source. */
  orphanedAliases: string[];
}

export interface DoctorEntry {
  provider: ProviderId;
  displayName: string;
  cli: CliRequirement;
  tool: ToolInfo;
  outdated: boolean;
  recipe: InstallRecipe | undefined;
}

/** What the next command will need before it can run. */
export type SessionNext = 'ready' | 'silent-renewal' | 'browser-sign-in' | 'unknown';

const NEXT_BY_STATE: Record<SessionState, SessionNext> = {
  valid: 'ready',
  refreshable: 'silent-renewal',
  expired: 'browser-sign-in',
  unknown: 'unknown',
};

export interface SourceStatus {
  id: string;
  provider: ProviderId;
  kind: string;
  settings: Record<string, string>;
  session: SessionState;
  next: SessionNext;
}

export interface AliasStatus {
  name: string;
  source: string;
  provider: ProviderId;
  target: string;
  /** Human label of the target, e.g. "acme-production / AdministratorAccess". */
  label: string | undefined;
  /** False when the target disappeared from the source since the last sync. */
  available: boolean;
  region: string | undefined;
  attributes: Record<string, string>;
  /** Marked as production: protected against accidental changes. */
  prod: boolean;
  /** The alias new terminals of its cloud start with. */
  default: boolean;
  session: SessionState;
  next: SessionNext;
}

/** Everything a person or an AI assistant needs to pick an alias. Never contains secrets. */
export interface Overview {
  sources: SourceStatus[];
  aliases: AliasStatus[];
}

export interface ShellEnv {
  provider: ProviderId;
  /** Variables to remove before setting `env`, so nothing from another alias is left behind. */
  clear: readonly string[];
  env: ProcessEnv;
  region: string | undefined;
  label: string | undefined;
  prod: boolean;
}

export interface RunOverrides {
  region?: string;
}

/** The use cases of cloudhop. Primary adapters (CLI, web UI) only talk to this class. */
export class CloudhopApp {
  constructor(private readonly deps: CloudhopDeps) {}

  // ── Providers ────────────────────────────────────────────────────────────

  availableProviders(): readonly CloudProvider[] {
    return this.deps.providers;
  }

  provider(id: ProviderId): CloudProvider {
    const provider = this.deps.providers.find((p) => p.id === id);
    if (!provider) {
      throw new CloudhopError(
        'PROVIDER_NOT_AVAILABLE',
        `The ${id} provider is not available yet.`,
        'Follow https://github.com/dayepesb/cloudhop for upcoming providers.',
      );
    }
    return provider;
  }

  async config(): Promise<Config> {
    return this.deps.config.load();
  }

  async setEnabledProviders(ids: readonly ProviderId[]): Promise<void> {
    for (const id of ids) this.provider(id);
    const config = await this.deps.config.load();
    config.providers = [...new Set(ids)];
    await this.deps.config.save(config);
  }

  async enableProvider(id: ProviderId): Promise<void> {
    const config = await this.deps.config.load();
    await this.setEnabledProviders([...config.providers, id]);
  }

  async disableProvider(id: ProviderId): Promise<void> {
    const config = await this.deps.config.load();
    const inUse = config.sources.filter((s) => s.provider === id).map((s) => s.id);
    if (inUse.length > 0) {
      throw new CloudhopError(
        'PROVIDER_DISABLED',
        `The ${id} provider is used by: ${inUse.join(', ')}.`,
        'Remove those sources first.',
      );
    }
    config.providers = config.providers.filter((p) => p !== id);
    await this.deps.config.save(config);
  }

  // ── Sources ──────────────────────────────────────────────────────────────

  async addSource(source: Source): Promise<void> {
    assertValidName('source', source.id);
    const config = await this.deps.config.load();
    if (config.sources.some((s) => s.id === source.id)) {
      throw new CloudhopError('SOURCE_EXISTS', `Source "${source.id}" already exists.`);
    }
    const provider = this.enabledProvider(config, source.provider);
    if (!provider.sourceKinds.some((k) => k.kind === source.kind)) {
      throw new CloudhopError(
        'SOURCE_NOT_FOUND',
        `Unknown ${provider.displayName} source kind "${source.kind}".`,
      );
    }
    config.sources.push(source);
    await this.deps.config.save(config);
  }

  async removeSource(sourceId: string): Promise<void> {
    const config = await this.deps.config.load();
    const source = this.findSource(config, sourceId);
    config.sources = config.sources.filter((s) => s.id !== sourceId);
    config.aliases = config.aliases.filter((a) => a.source !== sourceId);
    await this.deps.config.save(config);
    await this.deps.config.removeTargets(sourceId);
    await this.syncProfiles(source.provider);
  }

  /**
   * Adds a source and logs in to it. If that first login fails (a mistyped
   * portal URL, a cancelled sign-in) the source is forgotten again, so nothing
   * half-configured stays behind.
   */
  async connectSource(source: Source): Promise<SyncReport> {
    await this.addSource(source);
    try {
      return await this.login(source.id);
    } catch (error) {
      await this.removeSource(source.id).catch(() => {});
      throw error;
    }
  }

  async login(sourceId: string): Promise<SyncReport> {
    const config = await this.deps.config.load();
    const source = this.findSource(config, sourceId);
    const provider = this.provider(source.provider);
    this.deps.notify(`Logging in to ${source.id} (${provider.displayName})…`);
    await provider.login(source, {
      openBrowser: (url) => this.deps.browser.open(url),
      notify: this.deps.notify,
    });
    return this.syncSource(sourceId);
  }

  /** Makes sure the source has a usable session, renewing it silently or via login. */
  /**
   * Makes the source's session usable: renews it silently when possible, and
   * otherwise signs in through the browser, unless `interactive` is false, in
   * which case it fails with LOGIN_REQUIRED instead of opening a browser.
   */
  async ensureSession(
    sourceId: string,
    { interactive = true }: { interactive?: boolean } = {},
  ): Promise<SessionAction> {
    const config = await this.deps.config.load();
    const source = this.findSource(config, sourceId);
    const provider = this.provider(source.provider);
    const state = await provider.sessionState(source);
    if (state === 'valid' || state === 'unknown') return 'none';
    if (state === 'refreshable' && (await provider.refreshSession(source))) return 'refreshed';
    if (!interactive) throw loginRequired(sourceId);
    await this.login(sourceId);
    return 'logged-in';
  }

  /** Rediscovers every target of a source and rewrites the provider's profiles. */
  async syncSource(sourceId: string): Promise<SyncReport> {
    const config = await this.deps.config.load();
    const source = this.findSource(config, sourceId);
    const provider = this.provider(source.provider);

    const previous = await this.deps.config.loadTargets(sourceId);
    const targets = await provider.discoverTargets(source);
    await this.deps.config.saveTargets(sourceId, targets);
    await this.syncProfiles(source.provider);

    const currentIds = new Set(targets.map((t) => t.id));
    const previousIds = new Set(previous.map((t) => t.id));
    return {
      sourceId,
      targets,
      added: targets.filter((t) => !previousIds.has(t.id)),
      removed: previous.filter((t) => !currentIds.has(t.id)),
      orphanedAliases: config.aliases
        .filter((a) => a.source === sourceId && !currentIds.has(a.target))
        .map((a) => a.name),
    };
  }

  async listTargets(sourceId: string): Promise<Target[]> {
    return this.deps.config.loadTargets(sourceId);
  }

  // ── Aliases ──────────────────────────────────────────────────────────────

  async addAliases(aliases: readonly Alias[]): Promise<void> {
    const config = await this.deps.config.load();
    const names = new Set(config.aliases.map((a) => a.name));
    const touchedProviders = new Set<ProviderId>();

    for (const alias of aliases) {
      assertValidName('alias', alias.name);
      if (names.has(alias.name)) {
        throw new CloudhopError('ALIAS_EXISTS', `Alias "${alias.name}" already exists.`);
      }
      const source = this.findSource(config, alias.source);
      const targets = await this.deps.config.loadTargets(source.id);
      if (!targets.some((t) => t.id === alias.target)) {
        throw new CloudhopError(
          'TARGET_NOT_FOUND',
          `"${alias.target}" is not available in ${source.id}.`,
          `Run \`cloudhop sync ${source.id}\` to refresh the list.`,
        );
      }
      names.add(alias.name);
      touchedProviders.add(source.provider);
      config.aliases.push(alias);
    }

    // Write profiles first: a provider may reject a name (e.g. an existing hand-written profile).
    for (const id of touchedProviders) await this.syncProfiles(id, config);
    await this.deps.config.save(config);
  }

  async removeAlias(name: string): Promise<void> {
    const config = await this.deps.config.load();
    const alias = this.findAlias(config, name);
    const source = this.findSource(config, alias.source);
    config.aliases = config.aliases.filter((a) => a.name !== name);
    await this.deps.config.save(config);
    await this.syncProfiles(source.provider);
  }

  async listAliases(): Promise<ResolvedAlias[]> {
    const config = await this.deps.config.load();
    return Promise.all(config.aliases.map((a) => this.resolve(config, a)));
  }

  /** Sources with their session state and every alias, checked without signing in. */
  async overview(): Promise<Overview> {
    const config = await this.deps.config.load();
    const sources = await Promise.all(
      config.sources.map(async (source): Promise<SourceStatus> => {
        const session = await this.provider(source.provider).sessionState(source);
        return {
          id: source.id,
          provider: source.provider,
          kind: source.kind,
          settings: source.settings,
          session,
          next: NEXT_BY_STATE[session],
        };
      }),
    );
    const bySource = new Map(sources.map((s) => [s.id, s]));
    const aliases = await Promise.all(
      config.aliases.map(async (alias): Promise<AliasStatus> => {
        const resolved = await this.resolve(config, alias);
        const source = bySource.get(alias.source) as SourceStatus;
        return {
          name: alias.name,
          source: alias.source,
          provider: resolved.source.provider,
          target: alias.target,
          label: resolved.target?.label,
          available: Boolean(resolved.target),
          region: resolved.region,
          attributes: resolved.target?.attributes ?? {},
          prod: alias.prod === true,
          default: alias.default === true,
          session: source.session,
          next: source.next,
        };
      }),
    );
    return { sources, aliases };
  }

  /** The status of one alias: which account it points to and whether it can run right away. */
  async aliasStatus(name: string): Promise<AliasStatus> {
    const { aliases } = await this.overview();
    const status = aliases.find((a) => a.name === name);
    if (!status) {
      throw new CloudhopError(
        'ALIAS_NOT_FOUND',
        `Alias "${name}" not found.`,
        'See your aliases with `cloudhop ls`.',
      );
    }
    return status;
  }

  /** Renames an alias and its profile, keeping its account, role, region and production mark. */
  async renameAlias(from: string, to: string): Promise<void> {
    assertValidName('alias', to);
    const config = await this.deps.config.load();
    const alias = this.findAlias(config, from);
    if (from === to) return;
    if (config.aliases.some((a) => a.name === to)) {
      throw new CloudhopError('ALIAS_EXISTS', `Alias "${to}" already exists.`);
    }
    alias.name = to;
    const source = this.findSource(config, alias.source);
    await this.syncProfiles(source.provider, config);
    await this.deps.config.save(config);
  }

  /** Marks aliases as production (or not). Production aliases ask before changing anything. */
  async setProduction(names: readonly string[], prod: boolean): Promise<void> {
    const config = await this.deps.config.load();
    for (const name of names) {
      const alias = this.findAlias(config, name);
      if (prod) alias.prod = true;
      else delete alias.prod;
    }
    await this.deps.config.save(config);
  }

  /**
   * Makes an alias the one new terminals of its cloud start with, replacing
   * that cloud's previous default. Returns the cloud.
   */
  async setDefaultAlias(name: string): Promise<ProviderId> {
    const config = await this.deps.config.load();
    const alias = this.findAlias(config, name);
    const provider = this.findSource(config, alias.source).provider;
    for (const other of config.aliases) {
      if (this.findSource(config, other.source).provider === provider) delete other.default;
    }
    alias.default = true;
    await this.deps.config.save(config);
    return provider;
  }

  /** Clears the default alias of a cloud, or of every cloud. Returns the aliases it cleared. */
  async clearDefaultAlias(provider?: ProviderId): Promise<string[]> {
    const config = await this.deps.config.load();
    const cleared = config.aliases.filter(
      (a) => a.default && (!provider || this.findSource(config, a.source).provider === provider),
    );
    for (const alias of cleared) delete alias.default;
    if (cleared.length) await this.deps.config.save(config);
    return cleared.map((a) => a.name);
  }

  /** The alias new terminals start with, per cloud. */
  async defaultAliases(): Promise<Partial<Record<ProviderId, string>>> {
    const config = await this.deps.config.load();
    return Object.fromEntries(
      config.aliases
        .filter((a) => a.default)
        .map((a) => [this.findSource(config, a.source).provider, a.name]),
    );
  }

  /** Changes an alias' region; matching the source's region clears the override. */
  async setAliasRegion(name: string, region: string): Promise<void> {
    const config = await this.deps.config.load();
    const alias = this.findAlias(config, name);
    const source = this.findSource(config, alias.source);
    if (region === source.settings.region) delete alias.region;
    else alias.region = region;
    await this.syncProfiles(source.provider, config);
    await this.deps.config.save(config);
  }

  async resolveAlias(name: string, overrides: RunOverrides = {}): Promise<ResolvedAlias> {
    const config = await this.deps.config.load();
    const resolved = await this.resolve(config, this.findAlias(config, name));
    return overrides.region ? { ...resolved, region: overrides.region } : resolved;
  }

  // ── Running commands ─────────────────────────────────────────────────────

  /** Runs the provider's CLI as an alias. Logs in when needed and retries once on session errors. */
  async runAsAlias(
    name: string,
    args: readonly string[],
    overrides: RunOverrides = {},
  ): Promise<number> {
    const resolved = await this.usableAlias(name, overrides);
    const provider = this.provider(resolved.source.provider);
    await this.requireCli(provider);
    return this.runWithSession(resolved, provider, 'cli', provider.cli.command, args);
  }

  /** Runs any command with the alias' temporary credentials in its environment. */
  /**
   * Runs the alias' cloud CLI without a terminal and returns what it printed.
   * Used where stdin/stdout belong to someone else (the MCP server). It never
   * opens a browser: an expired session fails with LOGIN_REQUIRED.
   */
  async captureAsAlias(
    name: string,
    args: readonly string[],
    overrides: RunOverrides = {},
  ): Promise<CaptureResult> {
    const resolved = await this.usableAlias(name, overrides);
    const provider = this.provider(resolved.source.provider);
    await this.requireCli(provider);
    await this.ensureSession(resolved.source.id, { interactive: false });
    const env = await provider.processEnv(resolved, 'cli');
    const result = await this.deps.runner.capture(provider.cli.command, args, { env });
    if (result.exitCode !== 0 && provider.isSessionError(`${result.stdout}\n${result.stderr}`)) {
      throw loginRequired(resolved.source.id);
    }
    return result;
  }

  /**
   * Whether running these CLI arguments (or, with `args` undefined, any
   * command through `cloudhop exec`) as this alias needs a person's OK: true
   * for production aliases unless the command surely only reads.
   */
  async needsProductionConfirmation(name: string, args?: readonly string[]): Promise<boolean> {
    const resolved = await this.resolveAlias(name);
    if (!resolved.alias.prod) return false;
    if (!args) return true;
    return !this.provider(resolved.source.provider).isReadOnly(args);
  }

  /**
   * A URL that opens the web console as the alias, signing in first if the
   * session expired. The URL is a short-lived secret: open it, never print it.
   */
  async consoleUrl(
    name: string,
    {
      service,
      region,
      interactive = true,
    }: { service?: string; region?: string; interactive?: boolean } = {},
  ): Promise<ConsoleSignIn> {
    const resolved = await this.usableAlias(name, region ? { region } : {});
    const provider = this.provider(resolved.source.provider);
    if (!provider.consoleUrl) {
      throw new CloudhopError(
        'PROVIDER_NOT_AVAILABLE',
        `${provider.displayName} has no console sign-in in cloudhop yet.`,
      );
    }
    if (service !== undefined && !/^[a-z0-9-]{1,40}$/.test(service)) {
      throw new CloudhopError(
        'INVALID_NAME',
        `"${service}" doesn't look like a service name.`,
        'Examples: s3, ec2, lambda, cloudwatch.',
      );
    }
    await this.ensureSession(resolved.source.id, { interactive });
    return provider.consoleUrl(resolved, service);
  }

  /**
   * Opens the web console as the alias in the user's browser. The sign-in URL
   * stays inside cloudhop: callers only learn how the user got in.
   */
  async openConsole(
    name: string,
    options: { service?: string; region?: string; interactive?: boolean } = {},
  ): Promise<ConsoleSignIn['via']> {
    const { url, via } = await this.consoleUrl(name, options);
    await this.deps.browser.open(url);
    return via;
  }

  /** The command that shows who an alias is, e.g. `aws sts get-caller-identity`. */
  identityArgs(name: string): Promise<readonly string[]> {
    return this.resolveAlias(name).then((r) => this.provider(r.source.provider).identityArgs);
  }

  async execAsAlias(
    name: string,
    command: string,
    args: readonly string[],
    overrides: RunOverrides = {},
  ): Promise<number> {
    const resolved = await this.usableAlias(name, overrides);
    const provider = this.provider(resolved.source.provider);
    return this.runWithSession(resolved, provider, 'credentials', command, args);
  }

  async envForAlias(
    name: string,
    mode: EnvMode,
    overrides: RunOverrides = {},
  ): Promise<ProcessEnv> {
    const resolved = await this.usableAlias(name, overrides);
    const provider = this.provider(resolved.source.provider);
    await this.ensureSession(resolved.source.id);
    return provider.processEnv(resolved, mode);
  }

  /**
   * What `cloudhop use` puts in a shell: the alias' CLI environment (profile
   * and region, never credentials) and every variable of that provider to
   * clear first. With `login: false` it never signs in, so entering a folder
   * never opens a browser: the first command does it if needed.
   */
  async shellEnv(name: string, { login }: { login: boolean }): Promise<ShellEnv> {
    const resolved = await this.usableAlias(name, {});
    const provider = this.provider(resolved.source.provider);
    if (login) await this.ensureSession(resolved.source.id);
    return {
      provider: provider.id,
      clear: provider.shellVars,
      env: await provider.processEnv(resolved, 'cli'),
      region: resolved.region,
      label: resolved.target?.label,
      prod: resolved.alias.prod === true,
    };
  }

  /** The variables `cloudhop use --off <provider>` removes from a shell. */
  shellVars(provider: ProviderId): readonly string[] {
    return this.provider(provider).shellVars;
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async doctor(): Promise<DoctorEntry[]> {
    const config = await this.deps.config.load();
    const entries: DoctorEntry[] = [];
    for (const id of config.providers) {
      const provider = this.deps.providers.find((p) => p.id === id);
      if (provider) entries.push(await this.checkCli(provider));
    }
    return entries;
  }

  async checkCli(provider: CloudProvider): Promise<DoctorEntry> {
    const tool = await this.deps.runner.probe(provider.cli.command);
    const { minVersion } = provider.cli;
    const outdated = Boolean(
      tool.installed && minVersion && tool.version && compareVersions(tool.version, minVersion) < 0,
    );
    return {
      provider: provider.id,
      displayName: provider.displayName,
      cli: provider.cli,
      tool,
      outdated,
      recipe:
        !tool.installed || outdated
          ? this.deps.installer.recipeFor(provider.cli.command)
          : undefined,
    };
  }

  async installCli(recipe: InstallRecipe): Promise<boolean> {
    return this.deps.installer.install(recipe);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async runWithSession(
    resolved: ResolvedAlias,
    provider: CloudProvider,
    mode: EnvMode,
    command: string,
    args: readonly string[],
  ): Promise<number> {
    await this.ensureSession(resolved.source.id);
    const attempt = async () => {
      const env = await provider.processEnv(resolved, mode);
      return this.deps.runner.run(command, args, { env, captureStderr: true });
    };

    const first = await attempt();
    if (first.exitCode === 0 || !provider.isSessionError(first.stderrTail)) return first.exitCode;

    this.deps.notify('The session expired. Logging in again and retrying…');
    await this.login(resolved.source.id);
    return (await attempt()).exitCode;
  }

  private async usableAlias(name: string, overrides: RunOverrides): Promise<ResolvedAlias> {
    const resolved = await this.resolveAlias(name, overrides);
    if (!resolved.target) {
      throw new CloudhopError(
        'TARGET_NOT_FOUND',
        `Alias "${name}" points to "${resolved.alias.target}", which is no longer available in ${resolved.source.id}.`,
        `Run \`cloudhop sync ${resolved.source.id}\`, then recreate the alias.`,
      );
    }
    return resolved;
  }

  private async requireCli(provider: CloudProvider): Promise<void> {
    const entry = await this.checkCli(provider);
    if (!entry.tool.installed || entry.outdated) {
      const problem = entry.tool.installed
        ? `${provider.cli.displayName} ${entry.tool.version} is too old (need ${provider.cli.minVersion}+).`
        : `${provider.cli.displayName} is not installed.`;
      throw new CloudhopError(
        'CLI_MISSING',
        problem,
        'Run `cloudhop doctor` to install it, or `cloudhop exec` to use credentials without it.',
      );
    }
  }

  private async syncProfiles(providerId: ProviderId, pending?: Config): Promise<void> {
    const provider = this.deps.providers.find((p) => p.id === providerId);
    if (!provider) return;
    const config = pending ?? (await this.deps.config.load());
    const sources = config.sources.filter((s) => s.provider === providerId);
    const sourceIds = new Set(sources.map((s) => s.id));
    const aliases = await Promise.all(
      config.aliases.filter((a) => sourceIds.has(a.source)).map((a) => this.resolve(config, a)),
    );
    await provider.syncProfiles(sources, aliases);
  }

  private async resolve(config: Config, alias: Alias): Promise<ResolvedAlias> {
    const source = this.findSource(config, alias.source);
    const targets = await this.deps.config.loadTargets(source.id);
    return {
      alias,
      source,
      target: targets.find((t) => t.id === alias.target),
      region: alias.region ?? source.settings.region,
    };
  }

  private enabledProvider(config: Config, id: ProviderId): CloudProvider {
    const provider = this.provider(id);
    if (!config.providers.includes(id)) {
      throw new CloudhopError(
        'PROVIDER_DISABLED',
        `The ${provider.displayName} provider is not enabled.`,
        `Run \`cloudhop provider enable ${id}\`.`,
      );
    }
    return provider;
  }

  private findSource(config: Config, id: string): Source {
    const source = config.sources.find((s) => s.id === id);
    if (!source) {
      throw new CloudhopError(
        'SOURCE_NOT_FOUND',
        `Source "${id}" not found.`,
        'Run `cloudhop ls` to see your sources.',
      );
    }
    return source;
  }

  private findAlias(config: Config, name: string): Alias {
    const alias = config.aliases.find((a) => a.name === name);
    if (!alias) {
      throw new CloudhopError(
        'ALIAS_NOT_FOUND',
        `Alias "${name}" not found.`,
        'Run `cloudhop ls` to see your aliases.',
      );
    }
    return alias;
  }
}
