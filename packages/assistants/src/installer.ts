import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CloudhopError, type ProcessRunner } from '@cloudhop/core';
import skill from './assets/skill.md';
import {
  ASSISTANT_IDS,
  ASSISTANTS,
  type AssistantId,
  MCP_ARGS,
  MCP_COMMAND,
  type McpTarget,
  type Places,
  type Scope,
} from './targets';

export type SkillState = 'current' | 'outdated' | 'modified' | 'missing';
export type McpState = 'registered' | 'missing' | 'unknown';
export type McpOutcome = 'added' | 'already' | 'removed' | 'manual' | 'skipped';

export interface AssistantStatus {
  assistant: AssistantId;
  name: string;
  scope: Scope;
  detected: boolean;
  skill: SkillState;
  skillPath: string;
  mcp: McpState;
}

export interface InstallResult {
  assistant: AssistantId;
  name: string;
  scope: Scope;
  skillPath: string;
  mcp: McpOutcome;
  /** For `manual`: what the user should run or click instead. */
  mcpManual?: string;
}

/** One installed skill, remembered so later versions of cloudhop can refresh it. */
interface ManifestEntry {
  assistant: AssistantId;
  scope: Scope;
  skillFile: string;
  /** Hash of what cloudhop wrote, to tell an outdated copy from one the user edited. */
  hash: string;
  cloudhopVersion: string;
}

export interface AssistantsOptions {
  places: Places;
  /** cloudhop's own config folder; the manifest lives there. */
  configDir: string;
  runner: ProcessRunner;
  cloudhopVersion: string;
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.cloudhop-${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

async function removeFileAndEmptyDir(file: string): Promise<void> {
  await rm(file, { force: true });
  // Only removes the folder when nothing else is in it.
  await rmdir(dirname(file)).catch(() => {});
}

const readText = (file: string) => readFile(file, 'utf8').catch(() => undefined);

/** Installs the cloudhop skill and MCP server into AI assistants, and keeps them current. */
export class AssistantsInstaller {
  constructor(private readonly options: AssistantsOptions) {}

  /** The skill as written to disk: the bundled content plus a footer naming the version. */
  get skillContent(): string {
    // LF everywhere: a Windows checkout may hand the bundler CRLF, which breaks the frontmatter.
    return `${skill.replace(/\r\n/g, '\n').trimEnd()}\n\n<!-- Installed by cloudhop ${this.options.cloudhopVersion}. Refresh with \`cloudhop agent update\`; edits here are kept. -->\n`;
  }

  /** Assistants that look installed on this machine. */
  detect(): AssistantId[] {
    const { places } = this.options;
    return ASSISTANT_IDS.filter((id) => ASSISTANTS[id].markers(places).some((p) => existsSync(p)));
  }

  async status(scope: Scope): Promise<AssistantStatus[]> {
    const detected = new Set(this.detect());
    const manifest = await this.readManifest();
    return Promise.all(
      ASSISTANT_IDS.map(async (id): Promise<AssistantStatus> => {
        const assistant = ASSISTANTS[id];
        const skillPath = join(assistant.skillDir(scope, this.options.places), 'SKILL.md');
        const entry = manifest.find((e) => e.skillFile === skillPath);
        return {
          assistant: id,
          name: assistant.name,
          scope,
          detected: detected.has(id),
          skill: await this.skillState(skillPath, entry),
          skillPath,
          mcp: await this.mcpState(assistant.mcp(scope, this.options.places)),
        };
      }),
    );
  }

  async install(
    ids: readonly AssistantId[],
    scope: Scope,
    { mcp = true } = {},
  ): Promise<InstallResult[]> {
    const results: InstallResult[] = [];
    const manifest = await this.readManifest();
    for (const id of ids) {
      const assistant = ASSISTANTS[id];
      const skillPath = join(assistant.skillDir(scope, this.options.places), 'SKILL.md');
      const content = this.skillContent;
      await writeAtomic(skillPath, content);
      const kept = manifest.filter((e) => e.skillFile !== skillPath);
      kept.push({
        assistant: id,
        scope,
        skillFile: skillPath,
        hash: sha(content),
        cloudhopVersion: this.options.cloudhopVersion,
      });
      manifest.splice(0, manifest.length, ...kept);

      const target = assistant.mcp(scope, this.options.places);
      const outcome = mcp ? await this.addMcp(target) : { mcp: 'skipped' as const };
      results.push({ assistant: id, name: assistant.name, scope, skillPath, ...outcome });
    }
    await this.writeManifest(manifest);
    return results;
  }

  async remove(ids: readonly AssistantId[], scope: Scope): Promise<InstallResult[]> {
    const results: InstallResult[] = [];
    let manifest = await this.readManifest();
    for (const id of ids) {
      const assistant = ASSISTANTS[id];
      const dir = assistant.skillDir(scope, this.options.places);
      const skillPath = join(dir, 'SKILL.md');
      await rm(dir, { recursive: true, force: true });
      // Tidy `skills/` and its parent (e.g. `.agents/`) only if we left them empty.
      await rmdir(dirname(dir))
        .then(() => rmdir(dirname(dirname(dir))))
        .catch(() => {});
      manifest = manifest.filter((e) => e.skillFile !== skillPath);
      const outcome = await this.removeMcp(assistant.mcp(scope, this.options.places));
      results.push({ assistant: id, name: assistant.name, scope, skillPath, ...outcome });
    }
    await this.writeManifest(manifest);
    return results;
  }

  /**
   * Refreshes skills written by an older cloudhop. Copies the user edited are
   * left alone unless `force`. Cheap when there is nothing to do: one small read.
   */
  async update({ force = false } = {}): Promise<{ updated: string[]; edited: string[] }> {
    const manifest = await this.readManifest();
    const content = this.skillContent;
    const target = sha(content);
    const updated: string[] = [];
    const edited: string[] = [];
    let changed = false;
    for (const entry of manifest) {
      if (entry.hash === target) continue;
      const onDisk = await readText(entry.skillFile);
      if (onDisk === undefined) continue;
      if (sha(onDisk) !== entry.hash && !force) {
        edited.push(entry.skillFile);
        continue;
      }
      await writeAtomic(entry.skillFile, content);
      entry.hash = target;
      entry.cloudhopVersion = this.options.cloudhopVersion;
      updated.push(entry.skillFile);
      changed = true;
    }
    if (changed) await this.writeManifest(manifest);
    return { updated, edited };
  }

  // ───────────── skill state ─────────────

  private async skillState(path: string, entry: ManifestEntry | undefined): Promise<SkillState> {
    const onDisk = await readText(path);
    if (onDisk === undefined) return 'missing';
    if (onDisk === this.skillContent) return 'current';
    if (entry && sha(onDisk) !== entry.hash) return 'modified';
    return 'outdated';
  }

  // ───────────── MCP registration ─────────────

  private async mcpState(target: McpTarget): Promise<McpState> {
    if (target.kind === 'cli') return 'unknown';
    const text = await readText(target.file);
    if (text === undefined) return 'missing';
    if (target.kind === 'toml')
      return /^\[mcp_servers\.cloudhop\]/m.test(text) ? 'registered' : 'missing';
    try {
      const servers = (JSON.parse(text) as Record<string, Record<string, unknown> | undefined>)[
        target.key
      ];
      return servers?.cloudhop ? 'registered' : 'missing';
    } catch {
      return 'unknown';
    }
  }

  private async addMcp(target: McpTarget): Promise<{ mcp: McpOutcome; mcpManual?: string }> {
    switch (target.kind) {
      case 'json': {
        const config = await this.readJsonConfig(target.file);
        config[target.key] ??= {};
        const servers = config[target.key] as Record<string, unknown>;
        const entry = {
          ...(target.withType ? { type: 'stdio' } : {}),
          command: MCP_COMMAND,
          args: MCP_ARGS,
        };
        if (JSON.stringify(servers.cloudhop) === JSON.stringify(entry)) return { mcp: 'already' };
        servers.cloudhop = entry;
        await writeAtomic(target.file, `${JSON.stringify(config, null, 2)}\n`);
        return { mcp: 'added' };
      }
      case 'toml': {
        const text = (await readText(target.file)) ?? '';
        if (/^\[mcp_servers\.cloudhop\]/m.test(text)) return { mcp: 'already' };
        const block = `${TOML_MARK}\n[mcp_servers.cloudhop]\ncommand = "${MCP_COMMAND}"\nargs = [${MCP_ARGS.map((a) => `"${a}"`).join(', ')}]\n`;
        await writeAtomic(
          target.file,
          `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}`,
        );
        return { mcp: 'added' };
      }
      case 'cli': {
        if (!(await this.options.runner.probe(target.command)).installed) {
          return { mcp: 'manual', mcpManual: target.manual };
        }
        const result = await this.options.runner.capture(target.command, target.add);
        if (result.exitCode === 0) return { mcp: 'added' };
        if (/already exists/i.test(`${result.stdout}${result.stderr}`)) return { mcp: 'already' };
        return { mcp: 'manual', mcpManual: target.manual };
      }
    }
  }

  private async removeMcp(target: McpTarget): Promise<{ mcp: McpOutcome; mcpManual?: string }> {
    switch (target.kind) {
      case 'json': {
        const text = await readText(target.file);
        if (text === undefined) return { mcp: 'already' };
        const config = await this.readJsonConfig(target.file);
        const servers = config[target.key] as Record<string, unknown> | undefined;
        if (!servers?.cloudhop) return { mcp: 'already' };
        delete servers.cloudhop;
        // A file that held nothing but our server goes away with it.
        const onlyEmptyKey = Object.keys(servers).length === 0 && Object.keys(config).length === 1;
        if (onlyEmptyKey) await removeFileAndEmptyDir(target.file);
        else await writeAtomic(target.file, `${JSON.stringify(config, null, 2)}\n`);
        return { mcp: 'removed' };
      }
      case 'toml': {
        const text = await readText(target.file);
        if (!text || !/^\[mcp_servers\.cloudhop\]/m.test(text)) return { mcp: 'already' };
        // Drop our marker comment and the [mcp_servers.cloudhop] table, up to the next table.
        const cleaned = text
          .replace(new RegExp(`${escapeRegExp(TOML_MARK)}\\n`, 'g'), '')
          .replace(/^\[mcp_servers\.cloudhop\]\n(?:(?!\[)[^\n]*\n?)*/m, '')
          .replace(/\n{3,}/g, '\n\n');
        if (cleaned.trim()) await writeAtomic(target.file, `${cleaned.trimEnd()}\n`);
        else await removeFileAndEmptyDir(target.file);
        return { mcp: 'removed' };
      }
      case 'cli': {
        if (!target.remove || !(await this.options.runner.probe(target.command)).installed) {
          return {
            mcp: 'manual',
            mcpManual: `Remove the "cloudhop" MCP server in ${target.command === 'code' ? 'VS Code (MCP: List Servers)' : target.command}.`,
          };
        }
        await this.options.runner.capture(target.command, target.remove);
        return { mcp: 'removed' };
      }
    }
  }

  private async readJsonConfig(file: string): Promise<Record<string, unknown>> {
    const text = await readText(file);
    if (text === undefined || !text.trim()) return {};
    try {
      const value = JSON.parse(text) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value))
        return value as Record<string, unknown>;
    } catch {}
    throw new CloudhopError(
      'INVALID_NAME',
      `${file} isn't plain JSON (it may have comments), so cloudhop won't rewrite it.`,
      `Add the server by hand: "cloudhop": { "command": "cloudhop", "args": ["mcp"] }, or rerun with --no-mcp.`,
    );
  }

  // ───────────── manifest ─────────────

  private get manifestPath() {
    return join(this.options.configDir, 'assistants.json');
  }

  private async readManifest(): Promise<ManifestEntry[]> {
    const text = await readText(this.manifestPath);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as { installs?: ManifestEntry[] };
      return Array.isArray(parsed.installs) ? parsed.installs : [];
    } catch {
      return [];
    }
  }

  private async writeManifest(installs: ManifestEntry[]): Promise<void> {
    await writeAtomic(this.manifestPath, `${JSON.stringify({ installs }, null, 2)}\n`);
  }
}

const TOML_MARK = '# Added by cloudhop (`cloudhop agent remove` deletes it)';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&');
