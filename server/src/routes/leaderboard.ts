import type { FastifyInstance } from 'fastify';
import type {
  LeaderboardResponse,
  ScoreRow,
  SubmitScoreRequest,
  SubmitScoreResponse,
} from '@lr/shared/api';
import { DIFFICULTIES, type Difficulty } from '@lr/shared/difficulty';
import { normalizeInitials } from '@lr/shared/initials';
import type { Db } from '../db/db.ts';
import { sendError } from '../errors.ts';

export const TOP_N = 10;

const params = {
  type: 'object',
  required: ['difficulty'],
  properties: { difficulty: { type: 'string', enum: DIFFICULTIES } },
} as const;

const submitBody = {
  type: 'object',
  required: ['submissionId', 'initials', 'timeMs'],
  additionalProperties: false,
  properties: {
    submissionId: { type: 'string', format: 'uuid' },
    initials: { type: 'string', maxLength: 16 },
    timeMs: { type: 'integer', minimum: 1 },
  },
} as const;

/**
 * Trust-based global Top 10 per difficulty (LB-1, LB-2, LB-4, C-2). The browser reports the time;
 * the only checks are the initials filter and a positive integer time.
 */
export function leaderboardRoutes(app: FastifyInstance, db: Db, clock: () => number) {
  const top = db.prepare<[Difficulty, number]>(
    `SELECT id, initials, time_ms AS timeMs, created_at AS createdAt FROM scores
     WHERE difficulty = ? ORDER BY time_ms ASC, created_at ASC, id ASC LIMIT ?`,
  );
  const bySubmission = db.prepare<[string]>(
    'SELECT id, difficulty FROM scores WHERE submission_id = ?',
  );
  const insert = db.prepare<[string, Difficulty, string, number, number]>(
    'INSERT INTO scores (submission_id, difficulty, initials, time_ms, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const prune = db.prepare<[Difficulty, Difficulty, number]>(
    `DELETE FROM scores WHERE difficulty = ? AND id NOT IN (
       SELECT id FROM scores WHERE difficulty = ? ORDER BY time_ms ASC, created_at ASC, id ASC LIMIT ?)`,
  );
  const exists = db.prepare<[number]>('SELECT 1 FROM scores WHERE id = ?');
  const board = (d: Difficulty) => top.all(d, TOP_N) as ScoreRow[];

  const submit = db.transaction(
    (d: Difficulty, body: SubmitScoreRequest, initials: string): number | null => {
      const known = bySubmission.get(body.submissionId) as
        { id: number; difficulty: Difficulty } | undefined;
      // A retry under another difficulty: that row is not on this board, so no row id.
      if (known) return known.difficulty === d ? known.id : null;
      const id = Number(
        insert.run(body.submissionId, d, initials, body.timeMs, clock()).lastInsertRowid,
      );
      // Bounded storage: keep only the Top 10 per difficulty.
      prune.run(d, d, TOP_N);
      return exists.get(id) ? id : null;
    },
  );

  app.get<{ Params: { difficulty: Difficulty } }>(
    '/api/leaderboard/:difficulty',
    { schema: { params } },
    async (req): Promise<LeaderboardResponse> => ({
      difficulty: req.params.difficulty,
      rows: board(req.params.difficulty),
    }),
  );

  app.post<{ Params: { difficulty: Difficulty }; Body: SubmitScoreRequest }>(
    '/api/leaderboard/:difficulty',
    { schema: { params, body: submitBody } },
    async (req, reply): Promise<SubmitScoreResponse | void> => {
      const initials = normalizeInitials(req.body.initials);
      if (!initials)
        return sendError(reply, 400, 'bad_request', 'Initials must be exactly 3 letters A to Z');
      const d = req.params.difficulty;
      const rowId = submit(d, req.body, initials);
      return { difficulty: d, rows: board(d), rowId };
    },
  );
}
