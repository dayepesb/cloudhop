/// <reference lib="dom" />
// page.evaluate() callbacks run in the browser.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { CLI, sandbox } from '../sandbox';

type Sandbox = Awaited<ReturnType<typeof sandbox>>;

/** Starts `cloudhop ui` on a seeded sandbox and hands each test its link. */
const test = base.extend<{ box: Sandbox; uiUrl: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures take no dependencies here.
  box: async ({}, use) => {
    const box = await sandbox({ seed: true });
    await use(box);
    await box.cleanup();
  },
  uiUrl: async ({ box }, use) => {
    // A throwaway HOME with Kiro "installed", so the AI assistants section never touches real ones.
    const home = join(box.root, 'home');
    await mkdir(join(home, '.kiro'), { recursive: true });
    const child: ChildProcess = spawn(process.execPath, [CLI, 'ui', '--no-open', '--port', '0'], {
      env: box.env({ HOME: home, USERPROFILE: home, CLOUDHOP_NO_UPDATE_CHECK: '1' }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const url = await new Promise<string>((resolve, reject) => {
      let out = '';
      child.stdout?.on('data', (chunk) => {
        out += chunk;
        const match = /(http:\/\/127\.0\.0\.1:\d+\/#token=[\w-]+)/.exec(out);
        if (match?.[1]) resolve(match[1]);
      });
      child.on('exit', (code) => reject(new Error(`cloudhop ui exited (${code}): ${out}`)));
    });
    await use(url);
    child.kill();
  },
});

test('asks for the terminal link when opened without a token', async ({ page, uiUrl }) => {
  await page.goto(new URL(uiUrl).origin);
  await expect(
    page.getByRole('heading', { name: 'Open the link from your terminal' }),
  ).toBeVisible();
});

test('shows sources and aliases, and hides the token from the address bar', async ({
  page,
  uiUrl,
}) => {
  await page.goto(uiUrl);
  await expect(page.getByRole('heading', { name: 'demo' })).toBeVisible();
  await expect(page.getByText('Session valid')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'demo-dev', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'demo-account / Dev' })).toBeVisible();
  expect(page.url()).not.toContain('token');
});

test('changes a region and rejects typos', async ({ page, uiUrl, box }) => {
  await page.goto(uiUrl);
  const region = page.getByLabel('Region for demo-dev');

  await region.fill('us-wst-1');
  await region.press('Enter');
  await expect(page.getByText('Use an AWS region like us-east-1.')).toBeVisible();
  await expect(region).toHaveValue('us-east-1');

  await region.fill('eu-west-1');
  await region.press('Enter');
  await expect(page.getByText('demo-dev now runs in eu-west-1.')).toBeVisible();
  await expect(page.getByLabel('Region for demo-dev')).toHaveValue('eu-west-1');
  expect(await box.readAwsConfig()).toMatch(/\[profile demo-dev\][^[]*region = eu-west-1/);
});

test('creates an alias from the account picker', async ({ page, uiUrl, box }) => {
  await page.goto(uiUrl);
  await page.getByRole('button', { name: '+ Aliases' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Already: demo-dev')).toBeVisible();

  await dialog.getByPlaceholder(/Filter 2 account/).fill('other');
  await expect(dialog.getByText('demo-account / Dev')).toBeHidden();
  await dialog.getByRole('checkbox', { name: 'other-account / Admin' }).check();
  await dialog.getByLabel('Alias for other-account / Admin').fill('other-admin');
  await dialog.getByLabel('Region for other-account / Admin').fill('us-west-2');
  // Editing the inputs must not untick the account.
  await expect(dialog.getByRole('checkbox', { name: 'other-account / Admin' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create aliases' }).click();

  await expect(page.getByRole('cell', { name: 'other-admin', exact: true })).toBeVisible();
  expect(await box.readAwsConfig()).toMatch(
    /\[profile other-admin\][^[]*sso_account_id = 222222222222[^[]*region = us-west-2/,
  );
});

test('removes an alias and then the whole source', async ({ page, uiUrl, box }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(uiUrl);

  await page.getByRole('button', { name: 'Remove demo-dev' }).click();
  await expect(page.getByRole('cell', { name: 'demo-dev', exact: true })).toBeHidden();
  expect(await box.readConfig()).not.toContain('demo-dev');

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add your first account' })).toBeVisible();
  expect(await box.readConfig()).not.toContain('demo:');
});

test('fits a phone screen without sideways scrolling', async ({ page, uiUrl }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(uiUrl);
  await expect(page.getByRole('heading', { name: 'demo' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('teaches an AI assistant from the page', async ({ page, uiUrl, box }) => {
  await page.goto(uiUrl);
  const card = page.locator('#assistants');
  await expect(card.getByRole('heading', { name: 'AI assistants' })).toBeVisible();
  const kiro = card.getByRole('row', { name: /^Kiro/ });
  await expect(kiro).toContainText('Not installed');
  await kiro.getByRole('button', { name: 'Install' }).click();
  await expect(kiro).toContainText('Up to date');
  const skill = await readFile(
    join(box.root, 'home', '.kiro', 'skills', 'cloudhop', 'SKILL.md'),
    'utf8',
  );
  expect(skill).toContain('name: cloudhop');
});
