import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { LeaderboardResponse, SubmitScoreResponse } from '@lr/shared/api';
import { createApp } from '../src/app.ts';
import { testConfig } from './helpers/app.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make(dataDir?: string) {
  let now = 1_000_000;
  const config = testConfig(dataDir ? { dataDir } : {});
  app = await createApp(config, { logger: false, clock: () => now++ });
  return { app, config };
}

function submit(a: FastifyInstance, difficulty: string, body: Record<string, unknown>) {
  return a.inject({ method: 'POST', url: `/api/leaderboard/${difficulty}`, payload: body });
}

const run = (initials: string, timeMs: number) => ({
  submissionId: randomUUID(),
  initials,
  timeMs,
});

describe('leaderboard', () => {
  test('the same submissionId posted twice creates one row and returns the same row id', async () => {
    const { app: a } = await make();
    const body = run('JMD', 70_000);
    const r1 = (await submit(a, 'medium', body)).json() as SubmitScoreResponse;
    const r2res = await submit(a, 'medium', body);
    expect(r2res.statusCode).toBe(200);
    const r2 = r2res.json() as SubmitScoreResponse;
    expect(r1.rowId).not.toBeNull();
    expect(r2.rowId).toBe(r1.rowId);
    expect(r2.rows).toHaveLength(1);
  });

  test('a known submissionId posted under another difficulty returns no row id and adds no row', async () => {
    const { app: a } = await make();
    const body = run('JMD', 70_000);
    const r1 = (await submit(a, 'medium', body)).json() as SubmitScoreResponse;
    expect(r1.rowId).not.toBeNull();
    const r2 = (await submit(a, 'hard', body)).json() as SubmitScoreResponse;
    expect(r2.rowId).toBeNull();
    expect(r2.rows).toEqual([]);
  });

  test('12 submits return 10 rows fastest first, ties by submit time; table holds 10 medium rows', async () => {
    const { app: a, config } = await make();
    const times = [90, 80, 70, 60, 50, 40, 30, 20, 10, 55, 55, 100].map((s) => s * 1000);
    const ids: (number | null)[] = [];
    for (const [i, t] of times.entries()) {
      const r = (
        await submit(a, 'medium', run(['AAA', 'BBB', 'CCC'][i % 3]!, t))
      ).json() as SubmitScoreResponse;
      ids.push(r.rowId);
    }
    const board = (
      await a.inject({ method: 'GET', url: '/api/leaderboard/medium' })
    ).json() as LeaderboardResponse;
    expect(board.rows.map((r) => r.timeMs)).toEqual(
      [10, 20, 30, 40, 50, 55, 55, 60, 70, 80].map((s) => s * 1000),
    );
    const tied = board.rows.filter((r) => r.timeMs === 55_000);
    expect(tied[0]!.createdAt).toBeLessThan(tied[1]!.createdAt);
    expect(tied[0]!.id).toBe(ids[9]);
    expect(ids[11]).toBeNull();
    const db = new Database(path.join(config.dataDir, 'app.db'));
    expect(
      db.prepare("SELECT COUNT(*) FROM scores WHERE difficulty = 'medium'").pluck().get(),
    ).toBe(10);
    db.close();
  });

  test.each(['AB', 'ABCD', 'A1C', '', 'ÄBC'])('initials %j give 400', async (initials) => {
    const { app: a } = await make();
    const res = await submit(a, 'easy', run(initials, 1000));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });

  test('"abc" is stored as ABC', async () => {
    const { app: a } = await make();
    const r = (await submit(a, 'easy', run('abc', 1000))).json() as SubmitScoreResponse;
    expect(r.rows[0]!.initials).toBe('ABC');
  });

  test.each([0, -5, 1.5, '1000', null])('timeMs %j gives 400', async (timeMs) => {
    const { app: a } = await make();
    const res = await submit(a, 'easy', { submissionId: randomUUID(), initials: 'ABC', timeMs });
    expect(res.statusCode).toBe(400);
  });

  test('a missing or malformed submissionId gives 400', async () => {
    const { app: a } = await make();
    expect((await submit(a, 'easy', { initials: 'ABC', timeMs: 1 })).statusCode).toBe(400);
    expect(
      (await submit(a, 'easy', { submissionId: 'x', initials: 'ABC', timeMs: 1 })).statusCode,
    ).toBe(400);
  });

  test('boards are separate per difficulty', async () => {
    const { app: a } = await make();
    await submit(a, 'easy', run('EEE', 1000));
    await submit(a, 'hard', run('HHH', 2000));
    const easy = (
      await a.inject({ method: 'GET', url: '/api/leaderboard/easy' })
    ).json() as LeaderboardResponse;
    const hard = (
      await a.inject({ method: 'GET', url: '/api/leaderboard/hard' })
    ).json() as LeaderboardResponse;
    const medium = (
      await a.inject({ method: 'GET', url: '/api/leaderboard/medium' })
    ).json() as LeaderboardResponse;
    expect(easy.rows.map((r) => r.initials)).toEqual(['EEE']);
    expect(hard.rows.map((r) => r.initials)).toEqual(['HHH']);
    expect(medium.rows).toEqual([]);
  });

  test('GET and POST on /api/leaderboard/extreme give 400 and write no row', async () => {
    const { app: a, config } = await make();
    expect((await a.inject({ method: 'GET', url: '/api/leaderboard/extreme' })).statusCode).toBe(
      400,
    );
    expect((await submit(a, 'extreme', run('ABC', 1000))).statusCode).toBe(400);
    const db = new Database(path.join(config.dataDir, 'app.db'));
    expect(db.prepare('SELECT COUNT(*) FROM scores').pluck().get()).toBe(0);
    db.close();
  });

  test('data survives an app restart on the same DATA_DIR', async () => {
    const { app: a, config } = await make();
    await submit(a, 'medium', run('KEP', 5000));
    await a.close();
    app = undefined;
    const { app: b } = await make(config.dataDir);
    const board = (
      await b.inject({ method: 'GET', url: '/api/leaderboard/medium' })
    ).json() as LeaderboardResponse;
    expect(board.rows.map((r) => r.initials)).toEqual(['KEP']);
  });

  test('no IP or domain is stored with scores', async () => {
    const { app: a, config } = await make();
    await submit(a, 'medium', run('ABC', 5000));
    const db = new Database(path.join(config.dataDir, 'app.db'));
    const cols = db.prepare("SELECT name FROM pragma_table_info('scores')").pluck().all();
    expect(cols).toEqual([
      'id',
      'submission_id',
      'difficulty',
      'initials',
      'time_ms',
      'created_at',
    ]);
    db.close();
  });
});
