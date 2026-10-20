import type { MinuteJob } from '../jobs/minuteJob.ts';
import type { Blocklist } from '../policy/blocklist.ts';
import type { FaceCache } from './faceCache.ts';

/**
 * Every minute: delete entries older than the TTL and entries that match a blocklist entry by
 * key or source host. The blocklist CLI is another process, so this is how a new entry purges
 * the in-memory cache within 1 min (SEC-5, C-1).
 */
export function sweepCache(cache: FaceCache, blocklist: Blocklist, now: number) {
  cache.expire(now);
  for (const entry of blocklist.list()) cache.purge(entry);
}

export function registerCacheSweep(
  job: MinuteJob,
  cache: FaceCache,
  blocklist: Blocklist,
  clock: () => number,
) {
  job.register('face-cache', () => sweepCache(cache, blocklist, clock()));
}
