import { homedir } from 'node:os';
import { isAbsolute, relative } from 'node:path';
import {
  ASSISTANT_IDS,
  ASSISTANTS,
  type AssistantId,
  type AssistantsInstaller,
  type InstallResult,
  type Scope,
} from '@cloudhop/assistants';
import { CloudhopError } from '@cloudhop/core';
import { interactive, parseArgs } from '../flags';
import { answer, bold, p, paint } from '../ui';

const MCP_TEXT: Record<InstallResult['mcp'], string> = {
  added: paint('green', 'MCP server added'),
  already: 'MCP server already there',
  removed: 'MCP server removed',
  manual: paint('yellow', 'MCP server: add it by hand'),
  skipped: paint('dim', 'MCP server skipped'),
};

/** Paths as people read them: relative inside this project, ~ for the home folder. */
const tilde = (path: string) => {
  const inProject = relative(process.cwd(), path);
  if (!inProject.startsWith('..') && !isAbsolute(inProject)) return inProject;
  return path.replace(homedir(), '~');
};

function parseTools(value: string | undefined, fallback: AssistantId[]): AssistantId[] {
  if (!value) return fallback;
  const ids = value.split(',').map((v) => v.trim().toLowerCase());
  const unknown = ids.filter((id) => !ASSISTANT_IDS.includes(id as AssistantId));
  if (unknown.length) {
    throw new CloudhopError(
      'INVALID_NAME',
      `Unknown assistant: ${unknown.join(', ')}.`,
      `Use any of: ${ASSISTANT_IDS.join(', ')}.`,
    );
  }
  return ids as AssistantId[];
}

function parseScope(value: string | undefined): Scope | undefined {
  if (value === undefined) return undefined;
  if (value === 'user' || value === 'project') return value;
  throw new CloudhopError('INVALID_NAME', '--scope must be "user" or "project".');
}

function printResults(results: InstallResult[]): void {
  for (const r of results) {
    console.log(`${paint('green', '✔')} ${bold(r.name)}`);
    console.log(`  skill  ${tilde(r.skillPath)}`);
    console.log(`  ${MCP_TEXT[r.mcp]}${r.mcpManual ? `: ${r.mcpManual}` : ''}`);
  }
}

/**
 * `cloudhop agent [status|install|update|remove]`: teaches AI assistants
 * (Claude Code, Kiro, Copilot, Cursor, Codex) to use cloudhop, with a skill
 * and the `cloudhop mcp` server.
 */
export async function agentCommand(installer: AssistantsInstaller, args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const action = positional[0] ?? 'status';
  const scopeFlag = parseScope(flags.scope);

  switch (action) {
    case 'status': {
      for (const scope of scopeFlag ? [scopeFlag] : (['user', 'project'] as Scope[])) {
        console.log(
          bold(
            scope === 'user' ? 'For you (all projects)' : `This project (${tilde(process.cwd())})`,
          ),
        );
        for (const s of await installer.status(scope)) {
          const skill =
            s.skill === 'current'
              ? paint('green', '● skill up to date')
              : s.skill === 'outdated'
                ? paint('yellow', '◐ skill outdated (run `cloudhop agent update`)')
                : s.skill === 'modified'
                  ? paint(
                      'yellow',
                      '◐ skill edited by you (`cloudhop agent update --force` replaces it)',
                    )
                  : paint('dim', '○ no skill');
          const mcp =
            s.mcp === 'registered'
              ? ', MCP on'
              : s.mcp === 'unknown'
                ? ', MCP: check in the app'
                : '';
          const seen = s.detected ? '' : paint('dim', ' (not detected)');
          console.log(`  ${s.name.padEnd(26)} ${skill}${s.skill === 'missing' ? '' : mcp}${seen}`);
        }
      }
      return;
    }

    case 'install': {
      const detected = installer.detect();
      let tools = parseTools(flags.tools, detected);
      let scope = scopeFlag ?? 'user';
      let mcp = !flags.noMcp;
      if (!flags.tools && interactive() && !flags.yes) {
        p.intro('cloudhop agent install');
        p.note(
          'Installs a skill that teaches your AI assistant to ask which cloudhop alias to use,\nrun commands with hop, and confirm before changing anything. Optionally also\nregisters the cloudhop MCP server (tools to list aliases, check sessions and run the CLI).',
          'Teach your AI assistant cloudhop',
        );
        tools = answer(
          await p.multiselect<AssistantId>({
            message: 'Which assistants do you use?',
            options: ASSISTANT_IDS.map((id) => ({
              value: id,
              label: ASSISTANTS[id].name,
              ...(detected.includes(id) ? { hint: 'detected' } : {}),
            })),
            initialValues: detected,
            required: true,
          }),
        );
        if (!scopeFlag) {
          scope = answer(
            await p.select<Scope>({
              message: 'Where should it go?',
              options: [
                { value: 'user', label: 'For me, in every project', hint: 'your home folder' },
                {
                  value: 'project',
                  label: 'Only this project',
                  hint: 'commit it and your team gets it too',
                },
              ],
            }),
          );
        }
        if (!flags.noMcp) {
          mcp = answer(
            await p.confirm({
              message: 'Also register the cloudhop MCP server?',
              initialValue: true,
            }),
          );
        }
      }
      if (tools.length === 0) {
        throw new CloudhopError(
          'INVALID_NAME',
          'No AI assistant detected.',
          `Choose them with --tools ${ASSISTANT_IDS.join(',')}.`,
        );
      }
      printResults(await installer.install(tools, scope, { mcp }));
      console.log(
        paint('dim', '\nStart a new chat (or restart the assistant) so it picks up the skill.'),
      );
      return;
    }

    case 'update': {
      const { updated, edited } = await installer.update({ force: Boolean(flags.force) });
      for (const file of updated) console.log(`${paint('green', '✔')} updated ${tilde(file)}`);
      for (const file of edited)
        console.log(
          `${paint('yellow', '◐')} kept your edits in ${tilde(file)} (use --force to replace)`,
        );
      if (!updated.length && !edited.length) console.log('Every installed skill is up to date.');
      return;
    }

    case 'remove': {
      const scope = scopeFlag ?? 'user';
      const statuses = await installer.status(scope);
      const installed = statuses
        .filter((s) => s.skill !== 'missing' || s.mcp === 'registered')
        .map((s) => s.assistant);
      const tools = parseTools(flags.tools, installed);
      if (tools.length === 0) {
        console.log(`Nothing to remove for scope "${scope}".`);
        return;
      }
      printResults(await installer.remove(tools, scope));
      return;
    }

    default:
      throw new CloudhopError(
        'INVALID_NAME',
        `Unknown action "${action}".`,
        'Use: cloudhop agent [status | install | update | remove]',
      );
  }
}
