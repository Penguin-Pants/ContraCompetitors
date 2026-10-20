import { expect, test } from '@playwright/test';
import { gameState, openGame, scriptedRun } from './helpers.ts';

test('scripted run from start to exit shows a stopped timer', async ({ page }) => {
  await openGame(page, 'e2e=manual');
  await scriptedRun(page);
  const s = await gameState(page);
  expect(s.scene.finished).toBe(true);
  expect(s.scene.timer.state).toBe('stopped');
  expect(s.scene.timer.ms).toBeGreaterThan(40_000);
  const shown = await page.getByTestId('timer').textContent();
  await page.evaluate(() => window.__lr!.advance(120));
  await expect(page.getByTestId('timer')).toHaveText(shown!);
  expect(shown).toMatch(/^\d+:\d{2}\.\d{3}$/);
});

test('arrow keys do nothing and do not start the timer', async ({ page }) => {
  await openGame(page, 'e2e');
  const before = await gameState(page);
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  const after = await gameState(page);
  expect(after.scene.player.x).toBe(before.scene.player.x);
  expect(after.scene.timer.state).toBe('waiting');
  await expect(page.getByTestId('timer')).toHaveText('0:00.000');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  const moved = await gameState(page);
  expect(moved.scene.player.x).toBeGreaterThan(before.scene.player.x);
  expect(moved.scene.timer.state).toBe('running');
});
