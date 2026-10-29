import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessRunner } from '@cloudhop/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantsInstaller } from './installer';

class FakeRunner implements ProcessRunner {
  installed = new Set<string>();
  calls: string[] = [];
  async run() {
    return { exitCode: 0, stderrTail: '' };
  }
  async capture(command: string, args: readonly string[]) {
    this.calls.push(`${command} ${args.join(' ')}`);
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  async probe(command: string) {
    return { installed: this.installed.has(command) };
  }
}

let root: string;
let home: string;
let project: string;
let runner: FakeRunner;
const make = (version = '1.1.0') =>
  new AssistantsInstaller({
    places: { home, project },
    configDir: join(home, '.config', 'cloudhop'),
    runner,
    cloudhopVersion: version,
  });
const read = (...p: string[]) => readFile(join(...p), 'utf8');

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cloudhop-assistants-'));
  home = join(root, 'home');
  project = join(root, 'project');
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  runner = new FakeRunner();
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('AssistantsInstaller', () => {
  it('detects assistants from their folders', async () => {
    await mkdir(join(home, '.kiro'));
    await mkdir(join(home, '.cursor'));
    expect(make().detect()).toEqual(['kiro', 'cursor']);
  });

  it('installs the same skill everywhere and registers the MCP server', async () => {
    runner.installed.add('claude');
    const results = await make().install(['claude', 'kiro', 'cursor', 'codex'], 'user');

    for (const dir of ['.claude/skills', '.kiro/skills', '.cursor/skills', '.agents/skills']) {
      const skill = await read(home, dir, 'cloudhop', 'SKILL.md');
      expect(skill).toMatch(/^---\nname: cloudhop\ndescription: /);
      expect(skill).toContain('Installed by cloudhop 1.1.0');
    }
    expect(runner.calls).toContain('claude mcp add --scope user cloudhop -- cloudhop mcp');
    expect(JSON.parse(await read(home, '.kiro/settings/mcp.json'))).toEqual({
      mcpServers: { cloudhop: { command: 'cloudhop', args: ['mcp'] } },
    });
    expect(JSON.parse(await read(home, '.cursor/mcp.json')).mcpServers.cloudhop.type).toBe('stdio');
    expect(await read(home, '.codex/config.toml')).toContain(
      '[mcp_servers.cloudhop]\ncommand = "cloudhop"\nargs = ["mcp"]',
    );
    expect(results.map((r) => r.mcp)).toEqual(['added', 'added', 'added', 'added']);
  });

  it('keeps the servers the user already had', async () => {
    const file = join(project, '.vscode', 'mcp.json');
    await mkdir(join(project, '.vscode'));
    await writeFile(
      file,
      JSON.stringify({ servers: { github: { type: 'http', url: 'x' } }, inputs: [] }),
    );
    await make().install(['copilot'], 'project');
    const config = JSON.parse(await read(file));
    expect(config.servers.github).toEqual({ type: 'http', url: 'x' });
    expect(config.servers.cloudhop).toEqual({ type: 'stdio', command: 'cloudhop', args: ['mcp'] });
    expect(config.inputs).toEqual([]);
    expect(await read(project, '.github/skills/cloudhop/SKILL.md')).toContain('name: cloudhop');
  });

  it("refuses to rewrite a JSON file it can't parse", async () => {
    await mkdir(join(home, '.cursor'));
    await writeFile(join(home, '.cursor', 'mcp.json'), '{ // my servers\n}');
    await expect(make().install(['cursor'], 'user')).rejects.toThrow(/isn't plain JSON/);
  });

  it('falls back to manual steps when the assistant CLI is missing', async () => {
    const [result] = await make().install(['claude'], 'user');
    expect(result).toMatchObject({
      mcp: 'manual',
      mcpManual: expect.stringContaining('claude mcp add'),
    });
  });

  it('refreshes skills from older versions but keeps user edits', async () => {
    await make('1.1.0').install(['kiro', 'cursor'], 'user', { mcp: false });
    const edited = join(home, '.cursor/skills/cloudhop/SKILL.md');
    await writeFile(edited, `${await read(edited)}\nMy own rule.\n`);

    const { updated, edited: kept } = await make('1.2.0').update();
    expect(updated).toEqual([join(home, '.kiro/skills/cloudhop/SKILL.md')]);
    expect(kept).toEqual([edited]);
    expect(await read(home, '.kiro/skills/cloudhop/SKILL.md')).toContain('cloudhop 1.2.0');
    expect(await read(edited)).toContain('My own rule.');

    expect((await make('1.2.0').update({ force: true })).updated).toEqual([edited]);
    expect(await make('1.2.0').update()).toEqual({ updated: [], edited: [] });
  });

  it('reports status and removes everything it added', async () => {
    const codexToml = join(home, '.codex', 'config.toml');
    await mkdir(join(home, '.codex'));
    await writeFile(codexToml, 'model = "x"\n\n[mcp_servers.other]\ncommand = "other"\n');
    const installer = make();
    await installer.install(['codex', 'kiro'], 'user');

    const status = await installer.status('user');
    expect(status.find((s) => s.assistant === 'codex')).toMatchObject({
      skill: 'current',
      mcp: 'registered',
      detected: true,
    });
    expect(status.find((s) => s.assistant === 'cursor')).toMatchObject({
      skill: 'missing',
      mcp: 'missing',
    });

    await installer.remove(['codex', 'kiro'], 'user');
    expect(await read(codexToml)).toBe('model = "x"\n\n[mcp_servers.other]\ncommand = "other"\n');
    // Kiro's file only held cloudhop, so it is gone; Codex's had more, so only our table went.
    await expect(read(home, '.kiro/settings/mcp.json')).rejects.toThrow();
    expect((await installer.status('user')).find((s) => s.assistant === 'kiro')?.skill).toBe(
      'missing',
    );
  });
});
