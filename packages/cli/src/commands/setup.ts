import { ASSISTANTS, type AssistantsInstaller } from '@cloudhop/assistants';
import type { CloudhopApp, DoctorEntry, ProviderId } from '@cloudhop/core';
import { answer, p, printBanner, requireInteractive } from '../ui';
import { addCommand } from './add';
import { agentCommand } from './agent';

const UPCOMING = ['Azure', 'Google Cloud'];

const WELCOME = [
  'cloudhop lets you hop between cloud accounts, roles and regions with one command.',
  'Add your SSO portals and personal accounts once and give each account/role a short',
  'alias. Then `hop <alias> <command>` runs the cloud CLI as that account: cloudhop',
  'logs you in when a session expires, and never stores access keys.',
].join('\n');

/** Offers to install a missing or outdated cloud CLI. Returns true when it is usable. */
export async function offerInstall(app: CloudhopApp, entry: DoctorEntry): Promise<boolean> {
  const { cli, tool, recipe, outdated } = entry;
  if (tool.installed && !outdated) return true;

  const problem = outdated
    ? `${cli.displayName} ${tool.version} is too old (cloudhop needs ${cli.minVersion}+).`
    : `${cli.displayName} is not installed. cloudhop can still log you in, but needs it to run \`${cli.command}\` commands.`;
  p.log.warn(problem);

  if (!recipe?.command) {
    p.log.info(
      `Install it from ${recipe?.manualUrl ?? 'the official docs'}, then run \`cloudhop doctor\`.`,
    );
    return false;
  }
  const command = [recipe.command, ...recipe.args].join(' ');
  const install = answer(
    await p.confirm({ message: `Install it with ${recipe.via}?  (${command})` }),
  );
  if (!install) return false;

  const ok = await app.installCli(recipe);
  if (ok) p.log.success(`${cli.displayName} installed.`);
  else p.log.error(`Could not install automatically. See ${recipe.manualUrl}`);
  return ok;
}

export async function setupCommand(
  app: CloudhopApp,
  assistants: AssistantsInstaller,
): Promise<void> {
  requireInteractive(
    'setup',
    'Run it in a regular terminal, or script it: `cloudhop provider enable aws`, then `cloudhop add aws sso --start-url <url> --region <r>`.',
  );
  printBanner();
  p.intro('cloudhop setup');
  p.note(WELCOME, 'Welcome');
  const config = await app.config();

  const providers = answer(
    await p.multiselect<ProviderId>({
      message: 'Which clouds do you use?',
      options: app
        .availableProviders()
        .map((provider) => ({ value: provider.id, label: provider.displayName })),
      initialValues: config.providers.length > 0 ? config.providers : ['aws'],
      required: true,
    }),
  );
  p.log.info(`Coming soon: ${UPCOMING.join(', ')}.`);
  await app.setEnabledProviders(providers);

  for (const entry of await app.doctor()) {
    if (entry.tool.installed && !entry.outdated) {
      p.log.success(`${entry.cli.displayName} ${entry.tool.version ?? ''} found.`);
    } else {
      await offerInstall(app, entry);
    }
  }

  const addNow = answer(await p.confirm({ message: 'Add an account or SSO portal now?' }));
  if (addNow) await addCommand(app, { positional: [], flags: {} });
  else p.log.info('Run `cloudhop add` whenever you are ready.');

  // Last, optional: teach the AI assistants found on this machine to use cloudhop.
  const detected = assistants.detect();
  if (detected.length > 0) {
    const names = detected.map((id) => ASSISTANTS[id].name).join(', ');
    const teach = answer(
      await p.confirm({
        message: `Teach your AI assistant (${names}) to use cloudhop?`,
        initialValue: true,
      }),
    );
    if (teach) {
      await agentCommand(assistants, ['install']);
      return;
    }
    p.log.info('You can do it later with `cloudhop agent install`.');
  }
  if (!addNow) p.outro('All set.');
}

export async function doctorCommand(app: CloudhopApp): Promise<void> {
  p.intro('cloudhop doctor');
  const entries = await app.doctor();
  if (entries.length === 0) {
    p.outro('No cloud enabled. Run `cloudhop setup`.');
    return;
  }
  let healthy = true;
  for (const entry of entries) {
    if (entry.tool.installed && !entry.outdated) {
      p.log.success(`${entry.displayName}: ${entry.cli.displayName} ${entry.tool.version ?? ''}`);
    } else {
      healthy = (await offerInstall(app, entry)) && healthy;
    }
  }
  p.outro(
    healthy
      ? 'Everything looks good.'
      : 'Some tools are missing; login and `cloudhop exec` still work.',
  );
}
