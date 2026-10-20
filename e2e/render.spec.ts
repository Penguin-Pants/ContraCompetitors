import { expect, test } from '@playwright/test';
import { checkPixelBlocks } from './pixels.ts';

for (const [k, viewport] of [
  [1, { width: 1280, height: 720 }],
  [2, { width: 1920, height: 1080 }],
] as const) {
  test(`pixel blocks stay on the art grid at k=${k} with a 30 degree rotated sprite`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto('/?scene=test&e2e=manual');
    await page.waitForFunction(() => window.__lr !== undefined);
    await page.evaluate(() => window.__lr!.advance(37));
    const state = (await page.evaluate(() => window.__lr!.state())) as { k: number };
    expect(state.k).toBe(k);
    const result = await checkPixelBlocks(page, page.locator('canvas[data-layer="pixel"]'), 2 * k);
    expect(result.w).toBe(960 * k);
    expect(result.distinct).toBeGreaterThan(5);
    expect(result.bad).toBe(0);
    await context.close();
  });
}

test('narrow window shows the message and freezes; wide window hides it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?scene=test&e2e');
  const guard = page.getByText('Make the window wider to play');
  await expect(guard).toBeHidden();
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(guard).toBeVisible();
  const x1 = await page.evaluate(() => (window.__lr!.state() as { scene: { x: number } }).scene.x);
  await page.waitForTimeout(300);
  const x2 = await page.evaluate(() => (window.__lr!.state() as { scene: { x: number } }).scene.x);
  expect(x2).toBe(x1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(guard).toBeHidden();
});
