import { CloudhopError } from '../domain/errors';
import type { Alias, Config, ProviderId, ResolvedAlias, Source, Target } from '../domain/model';
import { assertValidName } from '../domain/naming';
import { compareVersions } from '../domain/version';
import type { CliRequirement, CloudProvider, EnvMode, ProcessEnv } from '../ports/cloud-provider';
import type { ConfigStore } from '../ports/config-store';
import type {
  BrowserOpener,
  InstallRecipe,
  ProcessRunner,
  ToolInfo,
  ToolInstaller,
} from '../ports/system';

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
  async ensureSession(sourceId: string): Promise<SessionAction> {
    const config = await this.deps.config.load();
    const source = this.findSource(config, sourceId);
    const provider = this.provider(source.provider);
    const state = await provider.sessionState(source);
    if (state === 'valid' || state === 'unknown') return 'none';
    if (state === 'refreshable' && (await provider.refreshSession(source))) return 'refreshed';
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
