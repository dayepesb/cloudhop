import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type Alias,
  type Config,
  type ConfigStore,
  emptyConfig,
  PROVIDER_IDS,
  type ProviderId,
  type Source,
  type Target,
} from '@cloudhop/core';
import { parse, stringify } from 'yaml';

/** `$CLOUDHOP_HOME`, else `$XDG_CONFIG_HOME/cloudhop`, else `~/.config/cloudhop`. */
export function defaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLOUDHOP_HOME) return env.CLOUDHOP_HOME;
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cloudhop');
}

/** The file is keyed by name so it stays pleasant to read and edit by hand. */
interface ConfigFile {
  providers?: string[];
  sources?: Record<string, Omit<Source, 'id'>>;
  aliases?: Record<string, Omit<Alias, 'name'>>;
}

const HEADER =
  '# cloudhop configuration. Contains no secrets.\n# Docs: https://github.com/dayepesb/cloudhop\n';

export class YamlConfigStore implements ConfigStore {
  constructor(private readonly dir: string = defaultConfigDir()) {}

  get configPath(): string {
    return join(this.dir, 'config.yaml');
  }

  private get targetsPath(): string {
    return join(this.dir, 'targets.json');
  }

  async load(): Promise<Config> {
    const raw = await this.read(this.configPath);
    if (!raw) return emptyConfig();
    const file = (parse(raw) ?? {}) as ConfigFile;
    return {
      providers: (file.providers ?? []).filter((p): p is ProviderId =>
        PROVIDER_IDS.includes(p as ProviderId),
      ),
      sources: Object.entries(file.sources ?? {}).map(([id, s]) => ({
        id,
        ...s,
        settings: s.settings ?? {},
      })),
      aliases: Object.entries(file.aliases ?? {}).map(([name, a]) => ({ name, ...a })),
    };
  }

  async save(config: Config): Promise<void> {
    const file: ConfigFile = {
      providers: config.providers,
      sources: Object.fromEntries(config.sources.map(({ id, ...rest }) => [id, rest])),
      aliases: Object.fromEntries(config.aliases.map(({ name, ...rest }) => [name, rest])),
    };
    await this.write(this.configPath, HEADER + stringify(file));
  }

  async loadTargets(sourceId: string): Promise<Target[]> {
    return (await this.allTargets())[sourceId] ?? [];
  }

  async saveTargets(sourceId: string, targets: Target[]): Promise<void> {
    const all = await this.allTargets();
    all[sourceId] = targets;
    await this.write(this.targetsPath, JSON.stringify(all, null, 2));
  }

  async removeTargets(sourceId: string): Promise<void> {
    const all = await this.allTargets();
    delete all[sourceId];
    await this.write(this.targetsPath, JSON.stringify(all, null, 2));
  }

  async reset(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }

  private async allTargets(): Promise<Record<string, Target[]>> {
    const raw = await this.read(this.targetsPath);
    return raw ? (JSON.parse(raw) as Record<string, Target[]>) : {};
  }

  private async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  /** Writes through a temp file so a crash never leaves a half-written config. */
  private async write(path: string, content: string): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, content, { mode: 0o600 });
    await rename(tmp, path);
  }
}
