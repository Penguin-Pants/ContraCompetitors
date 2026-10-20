import { expect, test } from '@playwright/test';

test('home page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('canvas[data-layer="pixel"]')).toBeVisible();
  expect(errors).toEqual([]);
});
