import { createInterface } from 'node:readline';
import { type CloudhopApp, CloudhopError } from '@cloudhop/core';
import { createTools } from './tools';

/**
 * Sent to the client when it connects. Clients that honour server
 * instructions (e.g. Claude Code, Codex) load it with the tools; keep the
 * first lines self-contained.
 */
export const MCP_INSTRUCTIONS = `cloudhop gives each cloud account + role + region a short alias and signs the user in only when a session expired.
Before the first cloud operation in a conversation: call list_aliases, show the user the aliases (name, account/role, region) and ask which one to use. Never guess the alias. If list_aliases has folder.aliases (the project's .cloudhoprc), inUse or an alias with default: true, offer that alias first, but still ask.
Use run_cloud_cli for cloud CLI commands, never --profile. Read-only commands may run once the alias is chosen; before anything that creates, changes or deletes resources, show the alias, account, region and exact command, and wait for the user's explicit OK. Aliases with prod: true are production: run_cloud_cli refuses changes there until the user approves and you pass confirm_production: true.
To show the user something in the web console, call open_console (it opens their browser, already signed in).
If a tool returns LOGIN_REQUIRED or alias_status says browser-sign-in: tell the user their browser will open, then call login (it waits up to 5 minutes for them to approve). Never print or ask for credentials.`;

/** Protocol revisions this server speaks; it only uses fields common to all of them. */
const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpServerOptions {
  app: CloudhopApp;
  version: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  /** Extra hints for list_aliases: aliases in use in the user's shell, the project's .cloudhoprc. */
  context?: () => Promise<object>;
}

/**
 * A Model Context Protocol server over stdio (newline-delimited JSON-RPC).
 * stdout carries only protocol messages: everything else goes to stderr.
 * Resolves when the client closes stdin.
 */
export function serveMcp({
  app,
  version,
  input = process.stdin,
  output = process.stdout,
  context,
}: McpServerOptions): Promise<void> {
  const tools = createTools(app, context);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const send = (message: unknown) => output.write(`${JSON.stringify(message)}\n`);
  const reply = (id: JsonRpcRequest['id'], result: unknown) => send({ jsonrpc: '2.0', id, result });
  const fail = (id: JsonRpcRequest['id'], code: number, message: string) =>
    send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  const handle = async (request: JsonRpcRequest): Promise<void> => {
    const { id, method, params = {} } = request;
    const isNotification = id === undefined;
    switch (method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        reply(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'cloudhop', title: 'cloudhop', version },
          instructions: MCP_INSTRUCTIONS,
        });
        return;
      }
      case 'ping':
        reply(id, {});
        return;
      case 'tools/list':
        reply(id, {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations,
          })),
        });
        return;
      case 'tools/call': {
        const tool = byName.get(String(params.name));
        if (!tool) {
          fail(id, -32602, `Unknown tool: ${String(params.name)}`);
          return;
        }
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          const result = await tool.run(args);
          reply(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          });
        } catch (error) {
          // Tool failures are results the assistant can read and act on, not protocol errors.
          const known = error instanceof CloudhopError;
          const body = {
            error: known ? error.code : 'UNEXPECTED',
            message: (error as Error).message,
            ...(known && error.hint ? { hint: error.hint } : {}),
          };
          reply(id, {
            content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
            structuredContent: body,
            isError: true,
          });
        }
        return;
      }
      default:
        if (!isNotification) fail(id, -32601, `Method not found: ${method}`);
    }
  };

  return new Promise((resolve) => {
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    const pending = new Set<Promise<void>>();
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        fail(null, -32700, 'Parse error');
        return;
      }
      // Responses from the client (we send no requests) and malformed messages are ignored.
      if (typeof request.method !== 'string') return;
      const task = handle(request).catch((error: unknown) => {
        if (request.id !== undefined) fail(request.id, -32603, (error as Error).message);
      });
      pending.add(task);
      task.finally(() => pending.delete(task));
    });
    lines.on('close', () => {
      Promise.allSettled([...pending]).then(() => resolve());
    });
  });
}
