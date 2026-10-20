import { expect, test } from '@playwright/test';
import { checkPixelBlocks } from './pixels.ts';
import { gameState, openGame, releaseAll, runUntil } from './helpers.ts';

test('Esc freezes the timer and the player for 2 s; Esc again resumes', async ({ page }) => {
  await openGame(page, 'e2e');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  const a = await gameState(page);
  await page.waitForTimeout(2000);
  const b = await gameState(page);
  expect(a.scene.timer.state).toBe('running');
  expect(b.scene.timer.ms).toBe(a.scene.timer.ms);
  expect(b.scene.player.x).toBe(a.scene.player.x);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  await page.waitForTimeout(400);
  const c = await gameState(page);
  expect(c.scene.timer.ms).toBeGreaterThan(b.scene.timer.ms);
  expect(c.scene.player.x).toBeGreaterThan(b.scene.player.x);
  await page.keyboard.up('KeyD');
});

test('Restart level from pause resets the timer to 0 and lives to 3', async ({ page }) => {
  await openGame(page);
  expect(await runUntil(page, 's.lives < 3')).toBe(true);
  await releaseAll(page);
  const hurt = await gameState(page);
  expect(hurt.scene.timer.ms).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'Paused' });
  await expect(menu.getByRole('button')).toHaveText(['Resume', 'Restart level']);
  await menu.getByRole('button', { name: 'Restart level' }).click();
  await expect(menu).toBeHidden();
  const s = await gameState(page);
  expect(s.scene.lives).toBe(3);
  expect(s.scene.timer.ms).toBe(0);
  expect(s.scene.timer.state).toBe('waiting');
  await expect(page.getByTestId('timer')).toHaveText('0:00.000');
});

test('combat VFX, laser and rotated projectiles stay on the art grid', async ({ page }) => {
  await openGame(page);
  const found = await runUntil(page, 's.laser && s.particles > 0 && s.enemies > 0', {
    fire: true,
    maxFrames: 60 * 90,
  });
  expect(found).toBe(true);
  await page.evaluate(() => {
    for (const l of ['bg', 'face', 'ui'])
      (document.querySelector(`[data-layer="${l}"]`) as HTMLElement).style.visibility = 'hidden';
  });
  const result = await checkPixelBlocks(page, page.locator('canvas[data-layer="pixel"]'), 2);
  expect(result.distinct).toBeGreaterThan(10);
  expect(result.bad).toBe(0);
});
