import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  NodeBrowserOpener,
  NodeProcessRunner,
  SystemToolInstaller,
  YamlConfigStore,
} from '@cloudhop/adapters-node';
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
