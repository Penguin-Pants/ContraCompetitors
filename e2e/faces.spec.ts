import { expect, test, type Page } from '@playwright/test';
import { ingestResponse, makeFaces } from './fixtures.ts';
import { gameState, openGame, runUntil } from './helpers.ts';

async function l2Alpha(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-layer="face"]')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    return n;
  });
}

async function runWithFaces(
  page: Page,
  faceStyle: 'smooth' | 'pixelated' | 'auto',
  widths: number[],
) {
  const faces = await makeFaces(page, widths);
  await openGame(page, 'e2e=manual', { faceStyle, ingest: ingestResponse({ faces }) });
  expect(await runUntil(page, 's.enemies > 0', { maxFrames: 600 })).toBe(true);
  await page.evaluate(() => window.__lr!.advance(1));
  return faces;
}

test('Smooth override draws faces on L2 and none on L1', async ({ page }) => {
  await runWithFaces(page, 'smooth', [40, 40, 40, 40, 40, 40]);
  const s = await gameState(page);
  expect(s.scene.faceStyle).toBe('smooth');
  expect(s.scene.faceDraws.l2).toBeGreaterThan(0);
  expect(s.scene.faceDraws.l1).toBe(0);
  expect(await l2Alpha(page)).toBeGreaterThan(0);
});

test('Pixelated override draws faces on L1 and none on L2', async ({ page }) => {
  await runWithFaces(page, 'pixelated', [512, 512, 512, 512, 512, 512]);
  const s = await gameState(page);
  expect(s.scene.faceStyle).toBe('pixelated');
  expect(s.scene.faceDraws.l1).toBeGreaterThan(0);
  expect(s.scene.faceDraws.l2).toBe(0);
  expect(await l2Alpha(page)).toBe(0);
});

test('Auto picks Smooth for sharp faces and Pixelated for small ones', async ({ page }) => {
  await runWithFaces(page, 'auto', [512, 512, 512, 40, 40]);
  expect((await gameState(page)).scene.faceStyle).toBe('smooth');
  await runWithFaces(page, 'auto', [512, 512, 40, 40]);
  expect((await gameState(page)).scene.faceStyle).toBe('pixelated');
});

test('a defeated enemy pops its face', async ({ page }) => {
  await runWithFaces(page, 'pixelated', [128, 128, 128, 128, 128]);
  expect(await runUntil(page, 's.pops > 0', { fire: true, maxFrames: 1200 })).toBe(true);
});
