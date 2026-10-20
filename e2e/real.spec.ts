import { expect, test } from '@playwright/test';
import { gameState, scriptedRun } from './helpers.ts';

const APP = 'http://localhost:4174';
const SITE = 'http://corp.test:4175/';

test('full journey against the real server: URL in, themed run with real faces, Top 10 out', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${APP}/?e2e=manual`);
  await page.getByLabel('Company website').fill(SITE);
  await page.getByLabel('Easy', { exact: true }).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(
    () => (window.__lr!.state() as { scene: { scene: string } }).scene.scene === 'game',
    null,
    {
      timeout: 35_000,
    },
  );
  const s = await gameState(page);
  expect(s.scene.faceIds).toHaveLength(6);
  expect(s.scene.theme).toEqual({ primary: '#e4002b', secondary: '#1e88e5' });
  await scriptedRun(page);
  await expect(page.getByRole('dialog', { name: 'Run complete' })).toBeVisible();
  await page.getByLabel('Initials').fill('jmd');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('board').locator('li.mine')).toContainText('JMD');
  const board = await (await page.request.get(`${APP}/api/leaderboard/easy`)).json();
  expect(board.rows.map((r: { initials: string }) => r.initials)).toContain('JMD');
});
