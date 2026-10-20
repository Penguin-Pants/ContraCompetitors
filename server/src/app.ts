import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import { openDb, type Db } from './db/db.ts';
import { installErrorHandler } from './errors.ts';
import { healthRoutes } from './routes/health.ts';
import { leaderboardRoutes } from './routes/leaderboard.ts';
import { indexHtmlRoutes } from './routes/indexHtml.ts';

/**
 * Code-only overrides for tests. Never filled from env vars.
 */
export interface AppDeps {
  db?: Db;
  logger?: boolean;
  /** Wall clock in ms. */
  clock?: () => number;
}

export async function createApp(config: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? true,
    // Strict request types: "1000" is not an integer.
    ajv: { customOptions: { coerceTypes: false } },
  });
  const db = deps.db ?? openDb(config.dataDir);
  app.addHook('onClose', async () => {
    db.close();
  });

  const clock = deps.clock ?? Date.now;
  installErrorHandler(app);
  healthRoutes(app);
  leaderboardRoutes(app, db, clock);

  if (config.clientDist && fs.existsSync(config.clientDist)) {
    indexHtmlRoutes(app, config, config.clientDist);
    await app.register(fastifyStatic, { root: config.clientDist, index: false });
  }
  return app;
}
