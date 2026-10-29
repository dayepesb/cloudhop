import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sandbox } from './sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;
let box: Sandbox;
afterEach(() => box?.cleanup());

/** Runs `cloudhop agent ...` with a throwaway HOME so real assistants are never touched. */
async function agentBox() {
  box = await sandbox();
  const home = join(box.root, 'home');
  await mkdir(join(home, '.kiro'), { recursive: true });
  await mkdir(join(home, '.cursor'), { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CLOUDHOP_NO_UPDATE_CHECK: '1' };
  return { home, agent: (...args: string[]) => box.run(['agent', ...args], env) };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

describe('cloudhop agent', () => {
  it('installs the skill and MCP server for the detected assistants', async () => {
    const { home, agent } = await agentBox();
    const install = await agent('install');
    expect(install.code).toBe(0);
    expect(install.stdout).toContain('Kiro');
    expect(install.stdout).toContain('Cursor');

    const skill = await readFile(join(home, '.kiro', 'skills', 'cloudhop', 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: cloudhop\n/);
    expect(skill).toContain('ask which');
    const cursorMcp = JSON.parse(await readFile(join(home, '.cursor', 'mcp.json'), 'utf8'));
    expect(cursorMcp.mcpServers.cloudhop).toEqual({
      type: 'stdio',
      command: 'cloudhop',
      args: ['mcp'],
    });

    const status = await agent('status', '--scope', 'user');
    expect(status.stdout).toMatch(/Kiro\s+● skill up to date, MCP on/);
  });

  it('chooses assistants with --tools and cleans up on remove', async () => {
    const { home, agent } = await agentBox();
    expect((await agent('install', '--tools', 'codex', '--no-mcp')).code).toBe(0);
    expect(await exists(join(home, '.agents', 'skills', 'cloudhop', 'SKILL.md'))).toBe(true);
    expect(await exists(join(home, '.codex', 'config.toml'))).toBe(false);

    expect((await agent('remove', '--tools', 'codex')).code).toBe(0);
    expect(await exists(join(home, '.agents', 'skills', 'cloudhop'))).toBe(false);
  });

  it('rejects unknown assistants', async () => {
    const { agent } = await agentBox();
    const result = await agent('install', '--tools', 'notepad');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('claude, kiro, copilot, cursor, codex');
  });
});
