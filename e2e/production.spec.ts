import { expect, test } from '@playwright/test';
import { enterGame, gameState, scriptedRun } from './helpers.ts';

/**
 * Production smoke test (Phase 11). Runs only with PROD_URL, against the deployed game:
 *   PROD_URL=https://game.example CONTACT_EMAIL=... SOURCE_URL=... PROD_SITE=https://company.example npm run e2e
 * It uses one real ingestion from the runner's IP and saves a score with initials "QAT".
 */
const PROD_URL = process.env.PROD_URL!;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
const SOURCE_URL = process.env.SOURCE_URL;
const PROD_SITE = process.env.PROD_SITE;

test('health, footer takedown and source links', async ({ page, request }) => {
  expect((await request.get(`${PROD_URL}/api/health`)).ok()).toBe(true);
  await page.goto(PROD_URL);
  if (CONTACT_EMAIL) {
    await expect(page.getByTestId('takedown-link').first()).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
  }
  if (SOURCE_URL)
    await expect(page.getByTestId('source-link').first()).toHaveAttribute('href', SOURCE_URL);
  const source = await page.getByTestId('source-link').first().getAttribute('href');
  expect((await request.get(source!)).ok()).toBe(true);
});

test('SUC-1: enter a real URL, play, see the time on the Top 10', async ({ page }) => {
  test.skip(!PROD_SITE, 'Set PROD_SITE to a public company URL');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${PROD_URL}/?e2e=manual`);
  await page.getByLabel('Company website').fill(PROD_SITE!);
  await page.getByLabel('Easy', { exact: true }).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await enterGame(page);
  expect((await gameState(page)).scene.scene).toBe('game');
  await scriptedRun(page);
  await expect(page.getByRole('dialog', { name: 'Run complete' })).toBeVisible();
  const initials = page.getByLabel('Initials');
  if (await initials.isVisible()) {
    await initials.fill('QAT');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('board').locator('li.mine')).toContainText('QAT');
  } else {
    await expect(page.getByTestId('board')).toBeVisible();
  }
});
