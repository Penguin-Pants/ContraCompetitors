import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import { openDb, type Db } from './db/db.ts';
import { healthRoutes } from './routes/health.ts';

/**
 * Code-only overrides for tests. Never filled from env vars.
 */
export interface AppDeps {
  db?: Db;
  logger?: boolean;
}

export async function createApp(config: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true });
  const db = deps.db ?? openDb(config.dataDir);
  app.addHook('onClose', async () => {
    db.close();
  });

  healthRoutes(app);

  if (config.clientDist && fs.existsSync(config.clientDist)) {
    await app.register(fastifyStatic, { root: config.clientDist });
  }
  return app;
}
