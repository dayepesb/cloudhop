import { join } from 'node:path';

export type AssistantId = 'claude' | 'kiro' | 'copilot' | 'cursor' | 'codex';
export type Scope = 'user' | 'project';

export const ASSISTANT_IDS: readonly AssistantId[] = [
  'claude',
  'kiro',
  'copilot',
  'cursor',
  'codex',
];

/** Where things live: the user's home and the project the command runs in. */
export interface Places {
  home: string;
  project: string;
}

/** How an assistant registers an MCP server for one scope. */
export type McpTarget =
  /** A JSON file whose `key` object holds servers by name (merged, never replaced). */
  | { kind: 'json'; file: string; key: 'mcpServers' | 'servers'; withType: boolean }
  /** A TOML file with `[mcp_servers.<name>]` tables (Codex). */
  | { kind: 'toml'; file: string }
  /** Only the assistant's own CLI can do it safely (its config is live app state). */
  | { kind: 'cli'; command: string; add: string[]; remove: string[] | undefined; manual: string };

export interface Assistant {
  id: AssistantId;
  name: string;
  /** Folders whose presence suggests the assistant is installed. */
  markers(places: Places): string[];
  /** The skill folder (it holds SKILL.md). All five read the same Agent Skills format. */
  skillDir(scope: Scope, places: Places): string;
  mcp(scope: Scope, places: Places): McpTarget;
}

export const SKILL_NAME = 'cloudhop';
export const MCP_COMMAND = 'cloudhop';
export const MCP_ARGS = ['mcp'];

// Paths follow each assistant's official docs (checked 2026-10-29); see docs/.../guides/ai-assistants.md.
export const ASSISTANTS: Record<AssistantId, Assistant> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    markers: ({ home }) => [join(home, '.claude')],
    skillDir: (scope, { home, project }) =>
      join(scope === 'user' ? home : project, '.claude', 'skills', SKILL_NAME),
    mcp: (scope, { project }) =>
      scope === 'project'
        ? { kind: 'json', file: join(project, '.mcp.json'), key: 'mcpServers', withType: false }
        : {
            kind: 'cli',
            command: 'claude',
            add: ['mcp', 'add', '--scope', 'user', 'cloudhop', '--', MCP_COMMAND, ...MCP_ARGS],
            remove: ['mcp', 'remove', '--scope', 'user', 'cloudhop'],
            manual: 'claude mcp add --scope user cloudhop -- cloudhop mcp',
          },
  },
  kiro: {
    id: 'kiro',
    name: 'Kiro',
    markers: ({ home }) => [join(home, '.kiro')],
    skillDir: (scope, { home, project }) =>
      join(scope === 'user' ? home : project, '.kiro', 'skills', SKILL_NAME),
    mcp: (scope, { home, project }) => ({
      kind: 'json',
      file: join(scope === 'user' ? home : project, '.kiro', 'settings', 'mcp.json'),
      key: 'mcpServers',
      withType: false,
    }),
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot (VS Code)',
    markers: ({ home }) => [join(home, '.copilot'), join(home, '.vscode')],
    skillDir: (scope, { home, project }) =>
      scope === 'user'
        ? join(home, '.copilot', 'skills', SKILL_NAME)
        : join(project, '.github', 'skills', SKILL_NAME),
    mcp: (scope, { project }) =>
      scope === 'project'
        ? {
            kind: 'json',
            file: join(project, '.vscode', 'mcp.json'),
            key: 'servers',
            withType: true,
          }
        : {
            kind: 'cli',
            command: 'code',
            add: [
              '--add-mcp',
              JSON.stringify({
                name: 'cloudhop',
                type: 'stdio',
                command: MCP_COMMAND,
                args: MCP_ARGS,
              }),
            ],
            remove: undefined,
            manual: 'VS Code → "MCP: Add Server" → stdio → command `cloudhop mcp`',
          },
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    markers: ({ home }) => [join(home, '.cursor')],
    skillDir: (scope, { home, project }) =>
      join(scope === 'user' ? home : project, '.cursor', 'skills', SKILL_NAME),
    mcp: (scope, { home, project }) => ({
      kind: 'json',
      file: join(scope === 'user' ? home : project, '.cursor', 'mcp.json'),
      key: 'mcpServers',
      withType: true,
    }),
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    markers: ({ home }) => [join(home, '.codex'), join(home, '.agents')],
    skillDir: (scope, { home, project }) =>
      join(scope === 'user' ? home : project, '.agents', 'skills', SKILL_NAME),
    mcp: (scope, { home, project }) => ({
      kind: 'toml',
      file: join(scope === 'user' ? home : project, '.codex', 'config.toml'),
    }),
  },
};
