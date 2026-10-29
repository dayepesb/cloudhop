export interface RunOptions {
  /** Merged over the current environment; `undefined` removes a variable. */
  env?: Record<string, string | undefined>;
  /** Keep the tail of stderr (still streamed to the user) to inspect it afterwards. */
  captureStderr?: boolean;
}

export interface RunResult {
  exitCode: number;
  stderrTail: string;
}

export interface ToolInfo {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  /** Runs attached to the user's terminal (stdin/stdout inherited). */
  run(command: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
  /** Runs silently and returns what the command printed. */
  capture(
    command: string,
    args: readonly string[],
    options?: Pick<RunOptions, 'env'>,
  ): Promise<CaptureResult>;
  probe(command: string): Promise<ToolInfo>;
}

export interface BrowserOpener {
  open(url: string): Promise<void>;
}

export interface InstallRecipe {
  /** Human readable description, e.g. "Homebrew". */
  via: string;
  command: string;
  args: string[];
  /** Shown when there is no automatic install for this platform. */
  manualUrl?: string;
}

export interface ToolInstaller {
  recipeFor(command: string): InstallRecipe | undefined;
  install(recipe: InstallRecipe): Promise<boolean>;
}
