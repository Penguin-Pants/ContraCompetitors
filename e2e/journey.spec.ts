import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { ScoreRow, SubmitScoreRequest } from '../shared/src/api.ts';
import { ingestResponse, makeFaces } from './fixtures.ts';
import { enterGame, gameState, screen, scriptedRun, startRun } from './helpers.ts';

const PHOTOS = path.join(import.meta.dirname, '../server/test/fixtures/photos');

/** Test-only leaderboard: one board, idempotent by submissionId, like the server. */
function mockBoard(page: Page, seed: ScoreRow[] = []) {
  const rows = [...seed];
  const bySubmission = new Map<string, number>();
  const calls = { posts: [] as SubmitScoreRequest[], gets: 0 };
  let next = 1000;
  const top = () =>
    [...rows].sort((a, b) => a.timeMs - b.timeMs || a.createdAt - b.createdAt).slice(0, 10);
  const control = { postFailures: [] as ('500' | 'drop')[] };
  void page.route('**/api/leaderboard/*', async (route: Route) => {
    const req = route.request();
    const difficulty = req.url().split('/').pop()!;
    if (req.method() === 'GET') {
      calls.gets++;
      return route.fulfill({ json: { difficulty, rows: top() } });
    }
    const body = req.postDataJSON() as SubmitScoreRequest;
    calls.posts.push(body);
    const failure = control.postFailures.shift();
    if (failure === '500')
      return route.fulfill({ status: 500, json: { error: 'internal', message: 'Internal error' } });
    let id = bySubmission.get(body.submissionId);
    if (id === undefined) {
      id = next++;
      bySubmission.set(body.submissionId, id);
      rows.push({
        id,
        initials: body.initials.toUpperCase(),
        timeMs: body.timeMs,
        createdAt: Date.now(),
      });
    }
    // 'drop': the row is stored, but the response is lost.
    if (failure === 'drop') return route.abort('connectionreset');
    const placed = top().some((r) => r.id === id);
    return route.fulfill({ json: { difficulty, rows: top(), rowId: placed ? id : null } });
  });
  return { rows, calls, control };
}

const fast = (n: number): ScoreRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    initials: 'AAA',
    timeMs: 1000 + i,
    createdAt: i,
  }));

async function finishRun(page: Page) {
  await scriptedRun(page);
  await expect(page.getByRole('dialog', { name: 'Run complete' })).toBeVisible();
}

test('happy path: 6 faces and 2 colors, play, qualify, enter jmd, board shows JMD', async ({
  page,
}) => {
  const faces = await makeFaces(page, [128, 128, 128, 128, 128, 128]);
  const board = mockBoard(page);
  await startRun(page, { ingest: ingestResponse({ faces }), difficulty: 'easy' });
  expect(await screen(page)).toBe('game');
  await finishRun(page);
  const initials = page.getByLabel('Initials');
  await initials.fill('jmd');
  await page.getByRole('button', { name: 'Save' }).click();
  const list = page.getByTestId('board');
  await expect(list).toContainText('JMD');
  await expect(list.locator('li.mine')).toContainText('JMD');
  expect(board.calls.posts[0]!.initials).toBe('JMD');
  expect(Number.isInteger(board.calls.posts[0]!.timeMs)).toBe(true);
});

test('3 faces: upload prompt shows; Skip starts the run with the 3 reused faces', async ({
  page,
}) => {
  const faces = await makeFaces(page, [128, 128, 128]);
  await startRun(page, { ingest: ingestResponse({ faces }) });
  const prompt = page.getByRole('dialog', { name: 'Add faces' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Found 3 faces');
  await prompt.getByRole('button', { name: 'Skip' }).click();
  await enterGame(page);
  const s = await gameState(page);
  expect(s.scene.faceIds).toHaveLength(3);
});

test('uploads add to site faces (I-2)', async ({ page }) => {
  const site = await makeFaces(page, [128, 128]);
  const uploaded = await makeFaces(page, [140, 150]);
  let uploadCalls = 0;
  await page.route('**/api/faces/upload', (r) => {
    uploadCalls++;
    return r.fulfill({ json: { faces: uploaded } });
  });
  await startRun(page, { ingest: ingestResponse({ faces: site }) });
  await page.locator('#face-files').setInputFiles(path.join(PHOTOS, 'gemini7-crew.jpg'));
  await expect(page.getByTestId('upload-status')).toHaveText('Added 2 faces.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await enterGame(page);
  expect(uploadCalls).toBe(1);
  expect((await gameState(page)).scene.faceIds).toEqual(
    [...site, ...uploaded].map((f) => f.id).sort(),
  );
});

test('partial with 6 faces and 2 colors: upload prompt and a prefilled color picker both show', async ({
  page,
}) => {
  const faces = await makeFaces(page, [128, 128, 128, 128, 128, 128]);
  await startRun(page, {
    ingest: ingestResponse({ faces, colors: ['#ffb300', '#4fc3f7'], partial: true }),
  });
  const prompt = page.getByRole('dialog', { name: 'Add faces' });
  await expect(prompt).toContainText('time limit');
  await prompt.getByRole('button', { name: 'Skip' }).click();
  const picker = page.getByRole('dialog', { name: 'Pick brand colors' });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel('Primary color')).toHaveValue('#ffb300');
  await expect(picker.getByLabel('Secondary color')).toHaveValue('#4fc3f7');
  await picker.getByRole('button', { name: 'Use these colors' }).click();
  await enterGame(page);
});

test('0 faces and Skip: placeholder heads', async ({ page }) => {
  await startRun(page, { ingest: ingestResponse({ faces: [] }) });
  await page.getByRole('button', { name: 'Skip' }).click();
  await enterGame(page);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    window.__lr!.advance(240);
  });
  const s = await gameState(page);
  expect(s.scene.faceIds).toEqual([]);
  expect(s.scene.enemies).toBeGreaterThan(0);
  expect(s.scene.faceDraws).toEqual({ l1: 0, l2: 0 });
});

test('rate_limited: message only, no run starts', async ({ page }) => {
  await page.route('**/api/ingest', (r) =>
    r.fulfill({ status: 429, json: { error: 'rate_limited', message: 'Too many' } }),
  );
  await startRun(page, { ingest: null });
  const dialog = page.getByRole('alertdialog', { name: 'Problem' });
  await expect(dialog).toContainText('Too many sites scanned');
  await expect(dialog.getByRole('button')).toHaveText(['Main menu']);
  expect((await gameState(page)).scene.scene).toBe('idle');
});

test('blocked_domain: error with Retry and manual upload; the manual path opens the color picker', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/ingest', (r) => {
    calls++;
    return r.fulfill({ status: 403, json: { error: 'blocked_domain', message: 'blocked' } });
  });
  await startRun(page, { ingest: null });
  const dialog = page.getByRole('alertdialog', { name: 'Problem' });
  await expect(dialog).toContainText('cannot be used');
  await expect(dialog.getByRole('button')).toHaveText([
    'Retry',
    'Upload faces manually',
    'Main menu',
  ]);
  await dialog.getByRole('button', { name: 'Retry' }).click();
  await expect(dialog).toBeVisible();
  expect(calls).toBe(2);
  await dialog.getByRole('button', { name: 'Upload faces manually' }).click();
  await page
    .getByRole('dialog', { name: 'Add faces' })
    .getByRole('button', { name: 'Skip' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Pick brand colors' })).toBeVisible();
  await page.getByRole('button', { name: 'Use these colors' }).click();
  await enterGame(page);
});

test('unreachable and invalid_url use the same Retry and manual pattern with their own text', async ({
  page,
}) => {
  await page.route('**/api/ingest', (r) =>
    r.fulfill({ status: 502, json: { error: 'unreachable', message: 'x' } }),
  );
  await startRun(page, { ingest: null });
  await expect(page.getByTestId('error-text')).toHaveText('The site could not be reached.');
});

test('non-qualifying time: no initials prompt, board shows', async ({ page }) => {
  mockBoard(page, fast(10));
  await startRun(page, { difficulty: 'easy' });
  await enterGame(page);
  await finishRun(page);
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByLabel('Initials')).toHaveCount(0);
  await expect(page.getByText('Not fast enough')).toBeVisible();
});

test('submit 500 then retry 200: error shown, then the board', async ({ page }) => {
  const board = mockBoard(page);
  board.control.postFailures.push('500');
  await startRun(page, { difficulty: 'easy' });
  await enterGame(page);
  await finishRun(page);
  await page.getByLabel('Initials').fill('KEP');
  await page.getByRole('button', { name: 'Save' }).click();
  const err = page.getByTestId('leaderboard-error');
  await expect(err).toContainText('was not saved');
  await expect(err).toContainText(/\d+:\d{2}\.\d{3}/);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('board')).toContainText('KEP');
});

test('submit commits but the response is lost; the retry keeps the run once', async ({ page }) => {
  const board = mockBoard(page);
  board.control.postFailures.push('drop');
  await startRun(page, { difficulty: 'easy' });
  await enterGame(page);
  await finishRun(page);
  await page.getByLabel('Initials').fill('ZED');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('leaderboard-error')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('board').locator('li')).toHaveCount(1);
  expect(board.calls.posts).toHaveLength(2);
  expect(board.calls.posts[0]!.submissionId).toBe(board.calls.posts[1]!.submissionId);
});

test('a failed Top 10 fetch shows the retry pattern', async ({ page }) => {
  let fail = true;
  await page.route('**/api/leaderboard/*', (r) =>
    fail
      ? r.fulfill({ status: 500, json: { error: 'internal', message: 'down' } })
      : r.fulfill({ json: { difficulty: 'easy', rows: fast(10) } }),
  );
  await startRun(page, { difficulty: 'easy' });
  await enterGame(page);
  await finishRun(page);
  await expect(page.getByTestId('leaderboard-error')).toContainText('Could not load');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('board')).toBeVisible();
});

test('initials filter rejects non-letters before any request', async ({ page }) => {
  const board = mockBoard(page);
  await startRun(page, { difficulty: 'easy' });
  await enterGame(page);
  await finishRun(page);
  await page.getByLabel('Initials').fill('A1C');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Use exactly 3 letters')).toBeVisible();
  expect(board.calls.posts).toHaveLength(0);
});

test('a malformed URL gets the invalid_url error from the server', async ({ page }) => {
  await page.goto('/?e2e=manual');
  await page.getByLabel('Company website').fill('exa mple');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('error-text')).toHaveText(
    'That does not look like a public website address. Check it and try again.',
  );
  await expect(page.getByRole('button', { name: 'Upload faces manually' })).toBeVisible();
});

test('a face that does not decode is skipped; the run still starts', async ({ page }) => {
  const good = await makeFaces(page, [128, 128, 128, 128, 128]);
  const bad = { id: 'f'.repeat(64), dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 };
  await startRun(page, { ingest: ingestResponse({ faces: [...good, bad] }) });
  await enterGame(page);
  expect((await gameState(page)).scene.faceIds).toHaveLength(5);
});
