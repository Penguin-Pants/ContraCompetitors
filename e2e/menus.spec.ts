import { expect, test } from '@playwright/test';
import { ingestResponse, makeFaces } from './fixtures.ts';
import { gameState, openGame, scriptedRun } from './helpers.ts';

test('pause menu has exactly Resume, Restart level, Main menu and Sound; Sound mutes; Main menu returns', async ({
  page,
}) => {
  await openGame(page, 'e2e');
  await page.keyboard.press('KeyD');
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Paused' });
  await expect(menu.getByRole('button')).toHaveText([
    'Resume',
    'Restart level',
    'Main menu',
    'Sound: On',
  ]);
  expect((await gameState(page)).scene.gain).toBeGreaterThan(0);
  await menu.getByRole('button', { name: 'Sound: On' }).click();
  await expect(menu.getByRole('button', { name: 'Sound: Off' })).toBeVisible();
  expect((await gameState(page)).scene.gain).toBe(0);
  await menu.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByLabel('Company website')).toBeVisible();
  expect((await gameState(page)).scene.scene).toBe('idle');
});

test('Play again reuses difficulty, faces and colors with no network call', async ({ page }) => {
  const faces = await makeFaces(page, [96, 96, 96, 96, 96, 96]);
  const ingest = ingestResponse({ faces, colors: ['#ffb300', '#4fc3f7'] });
  await openGame(page, 'e2e=manual', { difficulty: 'easy', ingest });
  const first = await gameState(page);
  await scriptedRun(page);
  const post = page.getByRole('dialog', { name: 'Run complete' });
  await expect(post).toBeVisible();
  await expect(post.getByTestId('final-time')).toHaveText(/^\d+:\d{2}\.\d{3}$/);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) requests.push(r.url());
  });
  await post.getByRole('button', { name: 'Play again' }).click();
  await expect(post).toBeHidden();
  const again = await gameState(page);
  expect(again.scene.finished).toBe(false);
  expect(again.scene.timer.state).toBe('waiting');
  expect(again.scene.difficulty).toBe('easy');
  expect(again.scene.faceIds).toEqual([...faces.map((f) => f.id)].sort());
  expect(again.scene.faceIds).toEqual(first.scene.faceIds);
  expect(again.scene.theme).toEqual(first.scene.theme);
  expect(requests).toEqual([]);
});

test('post-game Main menu returns to the menu', async ({ page }) => {
  await openGame(page, 'e2e=manual', { difficulty: 'easy' });
  await scriptedRun(page);
  await page
    .getByRole('dialog', { name: 'Run complete' })
    .getByRole('button', { name: 'Main menu' })
    .click();
  await expect(page.getByLabel('Company website')).toBeVisible();
});

test('footer links: takedown mailto, source code and About', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('takedown-link').first()).toHaveAttribute(
    'href',
    'mailto:takedown@example.com',
  );
  await expect(page.getByTestId('source-link').first()).toHaveAttribute(
    'href',
    'https://github.com/Penguin-Pants/ContraCompetitors',
  );
  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'About' });
  await expect(about).toBeVisible();
  await expect(about).toContainText('no face recognition');
  await expect(about).toContainText('24 hours');
  await expect(about.getByTestId('takedown-link')).toHaveAttribute(
    'href',
    'mailto:takedown@example.com',
  );
});

test('menu defaults: Medium and Face style Auto on every visit', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Pixelated', { exact: true }).check();
  await page.reload();
  await expect(page.getByLabel('Auto', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Medium', { exact: true })).toBeChecked();
});

test('menu keyboard: Tab reaches Start and Enter starts the run', async ({ page }) => {
  await page.route('**/api/ingest', (r) => r.fulfill({ json: ingestResponse() }));
  await page.goto('/?e2e=manual');
  await page.getByLabel('Company website').fill('example.test');
  await page.getByLabel('Company website').press('Enter');
  await page.waitForFunction(
    () => (window.__lr!.state() as { scene: { scene: string } }).scene.scene === 'game',
  );
});

test('audio stays suspended during pause, even after menu key presses', async ({ page }) => {
  await openGame(page, 'e2e');
  await page.keyboard.press('KeyD');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyS');
  await page.keyboard.press('KeyS');
  const audio = () => gameState(page).then((s) => s.scene.audio);
  await expect.poll(audio).toBe('suspended');
  await page.waitForTimeout(150);
  expect(await audio()).toBe('suspended');
  await page.keyboard.press('Escape');
  await expect.poll(audio).toBe('running');
});
