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
import { FaceCache } from './cache/faceCache.ts';
import { registerCacheSweep } from './cache/sweeper.ts';
import type { FaceCrop } from './faces/crop.ts';
import { FacePool, type PoolOptions } from './faces/pool.ts';
import type { HeadlessRun } from './ingest/pipeline.ts';
import type { HeadlessRunner } from './ingest/headless.ts';
import { LIMITS } from './net/limits.ts';
import { ingestRoutes } from './routes/ingest.ts';
import { uploadRoutes } from './routes/upload.ts';
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
  /** Ingestion budget in ms (production: 30 s). */
  ingestionMs?: number;
  pool?: PoolOptions;
  /** Headless retry. Undefined uses the Chromium runner; null turns it off; a function replaces it. */
  headless?: HeadlessRun | null;
  /** Test-only: Chromium sandbox off (the dev container runs as root). Production never sets this. */
  headlessSandbox?: false;
}

export interface AppServices {
  db: Db;
  blocklist: Blocklist;
  ingestLimiter: RateLimiter;
  uploadLimiter: RateLimiter;
  net: NetPolicy;
  minuteJob: MinuteJob;
  clock: () => number;
  cache: FaceCache;
  ingestionMs: number;
  /** Decode, detect and crop one image in the worker pool, within `timeoutMs`. */
  detect: (bytes: Uint8Array, timeoutMs?: number, signal?: AbortSignal) => Promise<FaceCrop[]>;
  headless: HeadlessRun | null;
  /** Counters of the Chromium runner, when it is in use. */
  headlessStats: HeadlessRunner['stats'] | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: AppServices;
  }
}

export const INGESTIONS_PER_HOUR = 5;
/** Abuse limit for the upload endpoint (CPU cost of detection). */
export const UPLOADS_PER_HOUR = 20;

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
  const cache = new FaceCache();
  registerCacheSweep(minuteJob, cache, blocklist, clock);
  const ingestionMs = deps.ingestionMs ?? LIMITS.ingestionMs;
  // The pool starts on first use, so routes that never detect faces load no model.
  let pool: FacePool | null = null;
  const detect = (bytes: Uint8Array, timeoutMs = ingestionMs, signal?: AbortSignal) => {
    pool ??= new FacePool(deps.pool);
    return pool.process(bytes, timeoutMs, signal);
  };
  let runner: HeadlessRunner | null = null;
  let headless: HeadlessRun | null;
  if (deps.headless !== undefined) headless = deps.headless;
  else {
    const { createHeadless } = await import('./ingest/headless.ts');
    runner = createHeadless({ net, log: app.log, sandbox: deps.headlessSandbox ?? true });
    headless = runner.run;
  }
  app.decorate('services', {
    db,
    blocklist,
    ingestLimiter: new RateLimiter(db, 'ingest', INGESTIONS_PER_HOUR, clock),
    uploadLimiter: new RateLimiter(db, 'upload', UPLOADS_PER_HOUR, clock),
    net,
    minuteJob,
    clock,
    cache,
    ingestionMs,
    detect,
    headless,
    headlessStats: runner?.stats ?? null,
  });
  app.addHook('onReady', async () => minuteJob.start());
  app.addHook('onClose', async () => {
    minuteJob.stop();
    await pool?.close();
    await runner?.close();
    db.close();
  });

  installErrorHandler(app);
  healthRoutes(app);
  leaderboardRoutes(app, db, clock);
  ingestRoutes(app);
  await uploadRoutes(app);

  if (config.clientDist && fs.existsSync(config.clientDist)) {
    indexHtmlRoutes(app, config, config.clientDist);
    await app.register(fastifyStatic, { root: config.clientDist, index: false });
  }
  return app;
}
