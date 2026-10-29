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

const dim = (text: string) => (process.stderr.isTTY ? `\x1b[2m${text}\x1b[22m` : text);
export const bold = (text: string) => (process.stdout.isTTY ? `\x1b[1m${text}\x1b[22m` : text);

const ANSI = { dim: [2, 22], green: [32, 39], yellow: [33, 39], red: [31, 39], cyan: [36, 39] };
/** Colors stdout text when it goes to a terminal. */
export const paint = (style: keyof typeof ANSI, text: string) =>
  process.stdout.isTTY ? `\x1b[${ANSI[style][0]}m${text}\x1b[${ANSI[style][1]}m` : text;

const BANNER = [
  '       _                    _  _',
  '  ___ | |  ___   _   _   __| || |__    ___   _ __',
  " / __|| | / _ \\ | | | | / _` || '_ \\  / _ \\ | '_ \\",
  '| (__ | || (_) || |_| || (_| || | | || (_) || |_) |',
  ' \\___||_| \\___/  \\__,_| \\__,_||_| |_| \\___/ | .__/',
  '                                            |_|',
].join('\n');

/** The cloudhop logo, shown when setup starts. */
export function printBanner(): void {
  console.log(paint('cyan', BANNER));
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
