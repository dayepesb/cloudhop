import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  defaultConfigDir,
  NodeBrowserOpener,
  NodeProcessRunner,
  SystemToolInstaller,
  YamlConfigStore,
} from '@cloudhop/adapters-node';
import { AssistantsInstaller } from '@cloudhop/assistants';
import { CloudhopApp } from '@cloudhop/core';
import { AwsProvider } from '@cloudhop/provider-aws';
import { notify } from './ui';

/** Composition root: the only place that knows every concrete adapter. */
export function createApp(env: NodeJS.ProcessEnv = process.env): CloudhopApp {
  const runner = new NodeProcessRunner();
  const awsDir = env.CLOUDHOP_AWS_DIR ?? join(homedir(), '.aws');

  return new CloudhopApp({
    config: new YamlConfigStore(),
    providers: [
      new AwsProvider({
        awsDir,
        runner,
        preferDeviceCode: () => env.CLOUDHOP_DEVICE_CODE === '1',
      }),
      // Azure and Google Cloud providers plug in here.
    ],
    runner,
    browser: new NodeBrowserOpener(),
    installer: new SystemToolInstaller(runner),
    notify,
  });
}

/** The installer behind `cloudhop agent`: the user's home, this project, cloudhop's config folder. */
export function createAssistants(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
): AssistantsInstaller {
  return new AssistantsInstaller({
    places: { home: homedir(), project: process.cwd() },
    configDir: defaultConfigDir(env),
    runner: new NodeProcessRunner(),
    cloudhopVersion: version,
  });
}
