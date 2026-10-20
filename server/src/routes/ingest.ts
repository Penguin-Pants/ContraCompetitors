import type { FastifyInstance } from 'fastify';
import type { IngestRequest, IngestResponse } from '@lr/shared/api';
import { toDto } from '../ingest/faceDto.ts';
import { newAccumulator } from '../ingest/images.ts';
import { runPipeline } from '../ingest/pipeline.ts';
import { canonicalHost } from '../net/hostname.ts';
import { FetchError } from '../net/safeFetch.ts';
import { sendError } from '../errors.ts';

const body = {
  type: 'object',
  required: ['url'],
  additionalProperties: false,
  properties: { url: { type: 'string', minLength: 1, maxLength: 2048 } },
} as const;

/** Error code to HTTP status. Private targets are `unreachable` with the generic text (E-2). */
const STATUS = {
  invalid_url: 400,
  blocked_domain: 403,
  unreachable: 502,
  rate_limited: 429,
} as const;
const MESSAGE = {
  invalid_url: 'That is not a valid public http or https URL.',
  blocked_domain: 'This site is on the blocklist.',
  unreachable: 'The site could not be reached.',
  rate_limited: 'Too many ingestions from your network. Try again later.',
} as const;

function parseTarget(raw: string): { url: string; host: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) return null;
  const host = canonicalHost(u.hostname);
  return host ? { url: u.href, host } : null;
}

/**
 * POST /api/ingest. Order: validate URL, blocklist, cache (free, Q-2), rate limit, pipeline.
 * The pipeline races the 30 s budget; on the deadline the response holds what was found with
 * `partial: true` (E-3).
 */
export function ingestRoutes(app: FastifyInstance) {
  app.post<{ Body: IngestRequest }>('/api/ingest', { schema: { body } }, async (req, reply) => {
    const s = app.services;
    const started = s.clock();
    const fail = (code: keyof typeof STATUS, reason: string, domain?: string) => {
      req.log.info({ domain, outcome: code, reason, ms: s.clock() - started }, 'ingest');
      return sendError(reply, STATUS[code], code, MESSAGE[code]);
    };
    const target = parseTarget(req.body.url);
    if (!target) return fail('invalid_url', 'parse');
    const { host } = target;
    if (s.blocklist.isBlocked(host)) return fail('blocked_domain', 'request host', host);

    const cached = s.cache.get(host, s.clock());
    if (cached) {
      req.log.info(
        { domain: host, outcome: 'ok', source: 'cache', faces: cached.faces.length },
        'ingest',
      );
      const res: IngestResponse = {
        domain: host,
        colors: cached.colors,
        faces: cached.faces,
        partial: false,
        source: 'cache',
      };
      return res;
    }

    // Only a request that fetches the target site uses a slot.
    if (!s.ingestLimiter.tryConsume(req.ip)) return fail('rate_limited', 'limit', host);

    const ctl = new AbortController();
    const acc = newAccumulator();
    // Real time, not the injectable clock: the budget is wall time for this request.
    const deadlineAt = Date.now() + s.ingestionMs;
    const detect = (bytes: Uint8Array, signal: AbortSignal) =>
      s.detect(bytes, deadlineAt - Date.now(), signal);
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<'deadline'>((resolve) => {
      timer = setTimeout(() => {
        ctl.abort();
        resolve('deadline');
      }, s.ingestionMs);
    });
    let outcome: { source: 'static' | 'headless' } | 'deadline';
    try {
      outcome = await Promise.race([
        runPipeline(target.url, acc, { net: s.net, detect, headless: s.headless }, ctl.signal),
        deadline,
      ]);
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
      if (err.code === 'aborted') outcome = 'deadline';
      else {
        const code =
          err.code === 'invalid_url' || err.code === 'blocked_domain' ? err.code : 'unreachable';
        return fail(code, err.reason, host);
      }
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }

    // Blocklist race: recheck the key and every source host before the cache write.
    const blockedSource = [host, ...acc.sourceHosts].find((h) => s.blocklist.isBlocked(h));
    if (blockedSource) return fail('blocked_domain', `source ${blockedSource}`, host);

    const partial = outcome === 'deadline';
    const faces = [...acc.faces.values()].map(toDto);
    const source =
      outcome === 'deadline' ? (acc.stats.headless ? 'headless' : 'static') : outcome.source;
    if (!partial) {
      s.cache.set(host, {
        colors: acc.colors,
        faces,
        sourceHosts: new Set(acc.sourceHosts),
        createdAt: s.clock(),
      });
    }
    req.log.info(
      {
        domain: host,
        outcome: 'ok',
        source,
        partial,
        faces: faces.length,
        images: acc.stats.images,
        ms: s.clock() - started,
      },
      'ingest',
    );
    const res: IngestResponse = { domain: host, colors: acc.colors, faces, partial, source };
    return reply.code(200).send(res);
  });
}
