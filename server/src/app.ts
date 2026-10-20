import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import { openDb, type Db } from './db/db.ts';
import { installErrorHandler } from './errors.ts';
import { MinuteJob } from './jobs/minuteJob.ts';
import { checkAddress } from './net/ipPolicy.ts';
import { systemResolver, type NetPolicy, type Resolver } from './net/safeFetch.ts';
import { Blocklist } from './policy/blocklist.ts';
import { RateLimiter } from './policy/rateLimit.ts';
import { healthRoutes } from './routes/health.ts';
import { indexHtmlRoutes } from './routes/indexHtml.ts';
import { leaderboardRoutes } from './routes/leaderboard.ts';

/**
 * Code-only overrides for tests. Never filled from env vars, so no production code path can
 * disable the IP policy.
 */
export interface AppDeps {
  db?: Db;
  logger?: boolean;
  /** Wall clock in ms. */
  clock?: () => number;
  resolver?: Resolver;
  checkIp?: NetPolicy['checkIp'];
}

export interface AppServices {
  db: Db;
  blocklist: Blocklist;
  ingestLimiter: RateLimiter;
  net: NetPolicy;
  minuteJob: MinuteJob;
  clock: () => number;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: AppServices;
  }
}

export const INGESTIONS_PER_HOUR = 5;

export async function createApp(config: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? true,
    // Trust exactly TRUST_PROXY_HOPS proxies, so request.ip is the client IP.
    trustProxy: (_addr: string, hop: number) => hop < config.trustProxyHops,
    // Strict request types: "1000" is not an integer.
    ajv: { customOptions: { coerceTypes: false } },
  });
  const db = deps.db ?? openDb(config.dataDir);
  const clock = deps.clock ?? Date.now;
  const blocklist = new Blocklist(db, clock);
  const net: NetPolicy = {
    resolve: deps.resolver ?? systemResolver,
    checkIp: deps.checkIp ?? checkAddress,
    isBlocked: (host) => blocklist.isBlocked(host),
  };
  const minuteJob = new MinuteJob((name, err) =>
    app.log.error({ err, task: name }, 'minute task failed'),
  );
  minuteJob.register('rate-events', () => RateLimiter.sweep(db, clock()));
  app.decorate('services', {
    db,
    blocklist,
    ingestLimiter: new RateLimiter(db, 'ingest', INGESTIONS_PER_HOUR, clock),
    net,
    minuteJob,
    clock,
  });
  app.addHook('onReady', async () => minuteJob.start());
  app.addHook('onClose', async () => {
    minuteJob.stop();
    db.close();
  });

  installErrorHandler(app);
  healthRoutes(app);
  leaderboardRoutes(app, db, clock);

  if (config.clientDist && fs.existsSync(config.clientDist)) {
    indexHtmlRoutes(app, config, config.clientDist);
    await app.register(fastifyStatic, { root: config.clientDist, index: false });
  }
  return app;
}
