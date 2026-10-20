import { expect, test } from '@playwright/test';
import { ingestResponse } from './fixtures.ts';
import { gameState, startRun } from './helpers.ts';

test('no colors opens the color picker; picked colors appear in the HUD accent', async ({
  page,
}) => {
  await startRun(page, { ingest: ingestResponse({ colors: [] }) });
  const picker = page.getByRole('dialog', { name: 'Pick brand colors' });
  await expect(picker).toBeVisible();
  await picker.getByLabel('Primary color').fill('#ff8800');
  await picker.getByLabel('Secondary color').fill('#33ddaa');
  await picker.getByRole('button', { name: 'Use these colors' }).click();
  await expect(picker).toBeHidden();
  await page.waitForFunction(
    () => (window.__lr!.state() as { scene: { scene: string } }).scene.scene === 'game',
  );
  const s = await gameState(page);
  expect(s.scene.theme).toEqual({ primary: '#ff8800', secondary: '#33ddaa' });
  const accent = await page
    .getByTestId('timer')
    .evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(accent).toBe('rgb(255, 136, 0)');
});

test('found colors skip the picker and are auto-adjusted for readability', async ({ page }) => {
  await startRun(page, { ingest: ingestResponse({ colors: ['#1a237e'] }) });
  await page.waitForFunction(
    () => (window.__lr!.state() as { scene: { scene: string } }).scene.scene === 'game',
  );
  await expect(page.getByRole('dialog', { name: 'Pick brand colors' })).toBeHidden();
  const s = await gameState(page);
  expect(s.scene.theme.primary).not.toBe('#1a237e');
  expect(s.scene.theme.secondary).not.toBe(s.scene.theme.primary);
});
