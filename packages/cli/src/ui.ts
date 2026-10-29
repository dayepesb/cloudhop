import * as p from '@clack/prompts';
import { CloudhopError } from '@cloudhop/core';
import { interactive } from './flags';

/** Raised when the user cancels a prompt (Ctrl-C / Esc). */
export class PromptCancelled extends Error {}

/** Unwraps a prompt result, turning a cancel into an exception. */
export function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) throw new PromptCancelled();
  return value as Exclude<T, symbol>;
}

/** Colors only for a terminal that wants them (https://no-color.org). */
const colorful = (stream: NodeJS.WriteStream) => Boolean(stream.isTTY) && !process.env.NO_COLOR;
const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM ?? '');

const dim = (text: string) => (colorful(process.stderr) ? `\x1b[2m${text}\x1b[22m` : text);
export const bold = (text: string) => (colorful(process.stdout) ? `\x1b[1m${text}\x1b[22m` : text);

/**
 * The "sky and coral" palette in the terminal: 24-bit colors when the
 * terminal supports them, the closest 256-color shade otherwise.
 */
const STYLES = {
  dim: ['2', '22'],
  green: ['32', '39'],
  yellow: ['33', '39'],
  red: ['31', '39'],
  sky: [truecolor ? '38;2;59;184;245' : '38;5;75', '39'],
  coral: [truecolor ? '38;2;255;122;89' : '38;5;209', '39'],
} as const;

/** Colors stdout text when it goes to a terminal. */
export const paint = (style: keyof typeof STYLES, text: string) =>
  colorful(process.stdout) ? `\x1b[${STYLES[style][0]}m${text}\x1b[${STYLES[style][1]}m` : text;

const BANNER = [
  '       _                    _  _',
  '  ___ | |  ___   _   _   __| || |__    ___   _ __',
  " / __|| | / _ \\ | | | | / _` || '_ \\  / _ \\ | '_ \\",
  '| (__ | || (_) || |_| || (_| || | | || (_) || |_) |',
  ' \\___||_| \\___/  \\__,_| \\__,_||_| |_| \\___/ | .__/',
  '                                            |_|',
];
/** Where "hop" starts in the banner: "cloud" in sky, "hop" in coral, like the wordmark. */
const HOP_COLUMN = 30;

/** The cloudhop logo, shown when setup starts. */
export function printBanner(): void {
  for (const line of BANNER) {
    console.log(paint('sky', line.slice(0, HOP_COLUMN)) + paint('coral', line.slice(HOP_COLUMN)));
  }
}

/** Progress messages go to stderr so piping a proxied command's output stays clean. */
export function notify(message: string): void {
  process.stderr.write(`${dim('cloudhop ›')} ${message}\n`);
}

/** Prompts need a terminal; without one (CI, scripts, `!` shells) say how to use flags instead. */
export function requireInteractive(command: string, hint: string): void {
  if (interactive()) return;
  throw new CloudhopError(
    'NOT_INTERACTIVE',
    `\`cloudhop ${command}\` asks questions, but this is not an interactive terminal.`,
    hint,
  );
}

/** Adapts a core validator (undefined = ok) to clack's signature. */
export const validator =
  (fn?: (value: string) => string | undefined) =>
  (value: string | undefined): string | undefined => {
    if (!value?.trim()) return 'Required.';
    return fn?.(value.trim());
  };

export { p };
