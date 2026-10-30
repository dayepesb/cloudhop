import { PROVIDER_IDS } from '@cloudhop/core';

const BEGIN =
  '# >>> cloudhop >>> (added by `cloudhop shell`; remove this block and the ${env_var.cloudhop_*} segments in `format` to undo)';
const END = '# <<< cloudhop <<<';

const SKY = '#3bb8f5';
const ON_SKY = '#0b1124';
const RED = '#be123c';

/** The `format` segments: per cloud, the alias (non-production) or the alias in red (production). */
export const STARSHIP_SEGMENTS = PROVIDER_IDS.map(
  (p) => `\${env_var.cloudhop_${p}}\${env_var.cloudhop_${p}_prod}`,
).join('');

/** A powerline-style theme: the glyph of its arrows and the color of the last segment. */
export interface Powerline {
  glyph: string;
  color: string;
}

/**
 * Segments that look like the rest of the prompt. In a powerline theme they
 * join the chain with its own arrows, from the last segment's color and
 * back to it; otherwise they are colored text, like Starship's own modules.
 * `cloudhop use` sets `CLOUDHOP_AWS_SEGMENT` or `CLOUDHOP_AWS_PROD_SEGMENT`,
 * never both, and `env_var` modules read them without running anything.
 */
export function starshipModules(powerline?: Powerline): string {
  const segment = (provider: string, prod: boolean) => {
    if (!powerline) {
      return prod
        ? `[${provider} $env_value PROD ](bold #fb7185)`
        : `[${provider} $env_value ](bold ${SKY})`;
    }
    const { glyph, color } = powerline;
    const bg = prod ? RED : SKY;
    const fg = prod ? '#ffffff' : ON_SKY;
    return `[${glyph}](fg:${color} bg:${bg})[ ${provider} $env_value${prod ? ' PROD' : ''} ](bold fg:${fg} bg:${bg})[${glyph}](fg:${bg} bg:${color})`;
  };
  return PROVIDER_IDS.map((p) => {
    const variable = `CLOUDHOP_${p.toUpperCase()}`;
    return `[env_var.cloudhop_${p}]
variable = '${variable}_SEGMENT'
format = '${segment(p, false)}'

[env_var.cloudhop_${p}_prod]
variable = '${variable}_PROD_SEGMENT'
format = '${segment(p, true)}'`;
  }).join('\n\n');
}

export const hasCloudhopStarship = (text: string) => text.includes('[env_var.cloudhop_aws]');

/** Powerline arrows and rounded caps (Nerd Font private use area). */
const CLOSING_GROUP = /\[\s*([-])\s*\]\(\s*fg:\s*(#[0-9a-fA-F]{3,8}|[a-z_]+)\s*\)/g;

/**
 * Adds cloudhop's segments to a starship.toml: the modules in a marked block
 * at the end, and, when the file has its own top-level `format`, the
 * segments inside it. In a powerline theme they go just before the arrow
 * that closes the chain; otherwise before `$line_break` or `$character`, or
 * at the end. A `format` with `$all` or `$env_var` already shows them.
 */
export function addToStarshipConfig(text: string): string {
  if (hasCloudhopStarship(text)) return text;
  let result = text;
  let powerline: Powerline | undefined;
  const format = findTopLevelFormat(result);
  if (format && !/\$all\b|\$\{?env_var\}?(?![._])/.test(format.content)) {
    const { content, multiline } = format;
    const continuation = multiline ? '\\\n' : '';
    const closing = [...content.matchAll(CLOSING_GROUP)].at(-1);
    const lineBreak = [content.lastIndexOf('$line_break'), content.lastIndexOf('$character')].find(
      (i) => i >= 0,
    );
    let updated: string;
    if (closing?.index !== undefined && (lineBreak === undefined || closing.index < lineBreak)) {
      powerline = { glyph: closing[1] as string, color: closing[2] as string };
      updated = `${content.slice(0, closing.index)}${STARSHIP_SEGMENTS}${continuation}${content.slice(closing.index)}`;
    } else if (lineBreak !== undefined) {
      updated = `${content.slice(0, lineBreak)}${STARSHIP_SEGMENTS}${continuation}${content.slice(lineBreak)}`;
    } else {
      // At the end, keeping the trailing newline of a """ string.
      const body = content.trimEnd();
      const tail = content.slice(body.length);
      const joiner = multiline && body.endsWith('\\') ? '\n' : '';
      updated = `${body}${joiner}${STARSHIP_SEGMENTS}${multiline ? '\\' : ''}${tail}`;
    }
    result = result.slice(0, format.start) + updated + result.slice(format.end);
  }
  const separator = result.length === 0 || result.endsWith('\n') ? '' : '\n';
  return `${result}${separator}\n${BEGIN}\n${starshipModules(powerline)}\n${END}\n`;
}

interface FormatValue {
  /** Where the string's content starts and ends in the file (quotes excluded). */
  start: number;
  end: number;
  content: string;
  multiline: boolean;
}

/** The value of `format = ...` before the first [table], if any. */
function findTopLevelFormat(text: string): FormatValue | undefined {
  const firstTable = text.search(/^[ \t]*\[/m);
  const head = firstTable === -1 ? text : text.slice(0, firstTable);
  const match = /^format\s*=\s*("""|'''|"|')/m.exec(head);
  if (!match) return undefined;
  const quote = match[1] as string;
  const start = match.index + match[0].length;
  const end = text.indexOf(quote, start);
  if (end === -1) return undefined;
  return { start, end, content: text.slice(start, end), multiline: quote.length === 3 };
}
