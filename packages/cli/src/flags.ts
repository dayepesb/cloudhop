/** `--start-url x`, `--start-url=x` and `--yes` style flags; everything else is positional. */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

const BOOLEAN_FLAGS = new Set(['yes', 'all', 'list', 'noOpen']);

/** "start-url" → "startUrl", so flags line up with provider field keys. */
const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const name = camel(rawName);
    if (inline !== undefined) flags[name] = inline;
    else if (BOOLEAN_FLAGS.has(name)) flags[name] = 'true';
    else flags[name] = argv[++i] ?? '';
  }
  return { positional, flags };
}

/** True when prompts can be shown: both ends are an interactive terminal. */
export const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);
