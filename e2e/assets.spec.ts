import { expect, test } from '@playwright/test';
import { ingestResponse, makeFaces } from './fixtures.ts';
import { openGame, scriptedRun } from './helpers.ts';

test('RND-7: no request goes to spritefusion.com during startup and a full run', async ({
  page,
}) => {
  const hosts = new Set<string>();
  page.on('request', (r) => hosts.add(new URL(r.url()).hostname));
  const faces = await makeFaces(page, [128, 128, 128, 128, 128]);
  await openGame(page, 'e2e=manual', { difficulty: 'easy', ingest: ingestResponse({ faces }) });
  await scriptedRun(page);
  await expect(page.getByRole('dialog', { name: 'Run complete' })).toBeVisible();
  expect([...hosts].filter((h) => /spritefusion/i.test(h))).toEqual([]);
  // Everything the page loads comes from the game server itself.
  expect([...hosts].filter((h) => h !== 'localhost' && h !== '127.0.0.1')).toEqual([]);
});
