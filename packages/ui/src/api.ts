import {
  type Alias,
  type CloudhopApp,
  CloudhopError,
  type ProviderId,
  type Source,
  type SyncReport,
  suggestAliasName,
  type Target,
} from '@cloudhop/core';

/** A JSON request the page sends; `params` come from the URL path. */
export interface ApiRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

type Handler = (params: string[], body: Record<string, unknown>) => Promise<unknown>;

const text = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
};

const badRequest = (message: string) => new CloudhopError('INVALID_NAME', message);

const targetView = (target: Target) => ({
  id: target.id,
  label: target.label,
  suggestedAlias: suggestAliasName(
    target.attributes.accountName ?? target.label,
    target.attributes.roleName ?? '',
  ),
});

const reportView = (report: SyncReport) => ({
  targets: report.targets.map(targetView),
  added: report.added.length,
  removed: report.removed.length,
  orphanedAliases: report.orphanedAliases,
});

/**
 * The page's JSON API: a thin translation from HTTP to CloudhopApp use cases.
 * It never returns tokens or credentials, only what `cloudhop ls` would show.
 */
export function createApi(app: CloudhopApp) {
  const regionCheck = (source: Source, region: string): void => {
    const validate = app
      .provider(source.provider)
      .sourceKinds.find((k) => k.kind === source.kind)
      ?.fields.find((f) => f.key === 'region')?.validate;
    const problem = region ? validate?.(region) : 'Region is required.';
    if (problem) throw badRequest(problem);
  };

  const findSource = async (id: string): Promise<Source> => {
    const source = (await app.config()).sources.find((s) => s.id === id);
    if (!source) throw new CloudhopError('SOURCE_NOT_FOUND', `Source "${id}" not found.`);
    return source;
  };

  const routes: Record<string, Handler> = {
    'GET /api/state': async () => {
      const config = await app.config();
      const aliases = await app.listAliases();
      const sources = await Promise.all(
        config.sources.map(async (source) => {
          const provider = app.provider(source.provider);
          return {
            id: source.id,
            provider: source.provider,
            providerName: provider.displayName,
            kind: source.kind,
            kindLabel:
              provider.sourceKinds.find((k) => k.kind === source.kind)?.label ?? source.kind,
            settings: source.settings,
            session: await provider.sessionState(source),
          };
        }),
      );
      return {
        enabledProviders: config.providers,
        providers: app.availableProviders().map((provider) => ({
          id: provider.id,
          name: provider.displayName,
          kinds: provider.sourceKinds.map((kind) => ({
            kind: kind.kind,
            label: kind.label,
            hint: kind.hint,
            nameLabel: kind.nameLabel,
            fields: kind.fields.map(({ key, label, placeholder, defaultValue }) => ({
              key,
              label,
              placeholder,
              defaultValue,
            })),
          })),
        })),
        sources,
        aliases: aliases.map(({ alias, target, region }) => ({
          name: alias.name,
          source: alias.source,
          target: alias.target,
          label: target?.label,
          missing: !target,
          region,
        })),
      };
    },

    'GET /api/doctor': async () =>
      (await app.doctor()).map((entry) => ({
        provider: entry.provider,
        cli: entry.cli.displayName,
        installed: entry.tool.installed,
        version: entry.tool.version,
        outdated: entry.outdated,
        minVersion: entry.cli.minVersion,
      })),

    'PUT /api/providers': async (_, body) => {
      const ids = Array.isArray(body.enabled) ? body.enabled : [];
      const known = new Set(app.availableProviders().map((p) => p.id));
      const enabled = ids.filter((id): id is ProviderId => known.has(id as ProviderId));
      if (enabled.length === 0) throw badRequest('Enable at least one cloud.');
      await app.setEnabledProviders(enabled);
      return { enabled };
    },

    /** Adds a source and logs in right away, like `cloudhop add`. */
    'POST /api/sources': async (_, body) => {
      const provider = app.provider(text(body, 'provider') as ProviderId);
      const kind = provider.sourceKinds.find((k) => k.kind === text(body, 'kind'));
      if (!kind) throw badRequest('Choose what you want to add.');
      const input = (body.settings ?? {}) as Record<string, unknown>;
      const settings: Record<string, string> = {};
      for (const field of kind.fields) {
        const value = text(input, field.key) || field.defaultValue || '';
        if (!value) throw badRequest(`${field.label} is required.`);
        const problem = field.validate?.(value);
        if (problem) throw badRequest(`${field.label}: ${problem}`);
        settings[field.key] = value;
      }
      const id = text(body, 'id');
      await app.addSource({ id, provider: provider.id, kind: kind.kind, settings });
      return reportView(await app.login(id));
    },

    'DELETE /api/sources/:id': async ([id]) => {
      await app.removeSource(id as string);
      return { removed: id };
    },

    'POST /api/sources/:id/login': async ([id]) => reportView(await app.login(id as string)),

    'POST /api/sources/:id/sync': async ([id]) => {
      await app.ensureSession(id as string);
      return reportView(await app.syncSource(id as string));
    },

    'GET /api/sources/:id/targets': async ([id]) => {
      await findSource(id as string);
      let targets = await app.listTargets(id as string);
      if (targets.length === 0) {
        await app.ensureSession(id as string);
        targets = (await app.syncSource(id as string)).targets;
      }
      return { targets: targets.map(targetView) };
    },

    'POST /api/aliases': async (_, body) => {
      const items = Array.isArray(body.aliases) ? (body.aliases as Record<string, unknown>[]) : [];
      if (items.length === 0) throw badRequest('Pick at least one account/role.');
      const aliases: Alias[] = [];
      for (const item of items) {
        const source = await findSource(text(item, 'source'));
        const region = text(item, 'region');
        if (region) regionCheck(source, region);
        aliases.push({
          name: text(item, 'name'),
          source: source.id,
          target: text(item, 'target'),
          ...(region && region !== source.settings.region ? { region } : {}),
        });
      }
      await app.addAliases(aliases);
      return { created: aliases.map((a) => a.name) };
    },

    'PATCH /api/aliases/:name': async ([name], body) => {
      const resolved = await app.resolveAlias(name as string);
      const region = text(body, 'region');
      regionCheck(resolved.source, region);
      await app.setAliasRegion(name as string, region);
      return { name, region };
    },

    'DELETE /api/aliases/:name': async ([name]) => {
      await app.removeAlias(name as string);
      return { removed: name };
    },
  };

  const table = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ') as [string, string];
    const regex = new RegExp(`^${pattern.replace(/:[a-z]+/g, '([^/]+)')}$`);
    return { method, regex, handler };
  });

  return async function handle(request: ApiRequest): Promise<ApiResponse> {
    for (const route of table) {
      const match = route.method === request.method && route.regex.exec(request.path);
      if (!match) continue;
      const params = match.slice(1).map(decodeURIComponent);
      const body = (request.body ?? {}) as Record<string, unknown>;
      try {
        return { status: 200, body: await route.handler(params, body) };
      } catch (error) {
        if (error instanceof CloudhopError) {
          const status = error.code.endsWith('NOT_FOUND') ? 404 : 400;
          return { status, body: { error: error.message, hint: error.hint, code: error.code } };
        }
        return { status: 500, body: { error: (error as Error).message ?? String(error) } };
      }
    }
    return { status: 404, body: { error: 'Not found.' } };
  };
}
