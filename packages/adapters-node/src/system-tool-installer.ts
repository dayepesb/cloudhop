import type { InstallRecipe, ProcessRunner, ToolInstaller } from '@cloudhop/core';

type Platform = 'darwin' | 'linux' | 'win32';

interface ToolRecipes {
  manualUrl: string;
  /** Official install methods per platform, in order of preference. */
  recipes: Partial<Record<Platform, InstallRecipe[]>>;
}

const TOOLS: Record<string, ToolRecipes> = {
  aws: {
    manualUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
    recipes: {
      darwin: [{ via: 'Homebrew', command: 'brew', args: ['install', 'awscli'] }],
      win32: [
        { via: 'winget', command: 'winget', args: ['install', '--exact', '--id', 'Amazon.AWSCLI'] },
      ],
    },
  },
  az: {
    manualUrl: 'https://learn.microsoft.com/cli/azure/install-azure-cli',
    recipes: {
      darwin: [{ via: 'Homebrew', command: 'brew', args: ['install', 'azure-cli'] }],
      win32: [
        {
          via: 'winget',
          command: 'winget',
          args: ['install', '--exact', '--id', 'Microsoft.AzureCLI'],
        },
      ],
    },
  },
  gcloud: {
    manualUrl: 'https://cloud.google.com/sdk/docs/install',
    recipes: {
      darwin: [
        { via: 'Homebrew', command: 'brew', args: ['install', '--cask', 'google-cloud-sdk'] },
      ],
      win32: [
        {
          via: 'winget',
          command: 'winget',
          args: ['install', '--exact', '--id', 'Google.CloudSDK'],
        },
      ],
    },
  },
};

/**
 * Knows the official way to install each cloud CLI. Installing always happens after the
 * user confirms (the CLI asks); on platforms without a package manager recipe, it only
 * returns the documentation URL.
 */
export class SystemToolInstaller implements ToolInstaller {
  private readonly available = new Map<string, boolean>();

  constructor(
    private readonly runner: ProcessRunner,
    private readonly platform: string = process.platform,
  ) {}

  recipeFor(command: string): InstallRecipe | undefined {
    const tool = TOOLS[command];
    if (!tool) return undefined;
    const recipe = tool.recipes[this.platform as Platform]?.[0];
    return recipe
      ? { ...recipe, manualUrl: tool.manualUrl }
      : { via: 'official installer', command: '', args: [], manualUrl: tool.manualUrl };
  }

  async install(recipe: InstallRecipe): Promise<boolean> {
    if (!recipe.command) return false;
    if (!(await this.hasCommand(recipe.command))) return false;
    const { exitCode } = await this.runner.run(recipe.command, recipe.args);
    return exitCode === 0;
  }

  private async hasCommand(command: string): Promise<boolean> {
    if (!this.available.has(command)) {
      this.available.set(command, (await this.runner.probe(command)).installed);
    }
    return this.available.get(command) ?? false;
  }
}
