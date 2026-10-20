import dns from 'node:dns';
import { Agent, request } from 'undici';
import type { IpVerdict } from './ipPolicy.ts';
import { canonicalHost, isIpLiteral } from './hostname.ts';
import { LIMITS, type BodyKind } from './limits.ts';

export type FetchErrorCode =
  | 'invalid_url'
  | 'blocked_domain'
  | 'unreachable'
  | 'too_large'
  | 'bad_type'
  | 'http_error'
  | 'aborted';

/** `reason` is for logs only. Responses use the generic code (E-2). */
export class FetchError extends Error {
  readonly code: FetchErrorCode;
  readonly reason: string;

  constructor(code: FetchErrorCode, reason: string) {
    super(`${code}: ${reason}`);
    this.code = code;
    this.reason = reason;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

/** All A and AAAA answers from the system resolver. */
export const systemResolver: Resolver = async (host) => {
  const answers = await dns.promises.lookup(host, { all: true, verbatim: true });
  return answers.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/** Network policy. Production values are fixed in `createApp`; tests inject their own. */
export interface NetPolicy {
  resolve: Resolver;
  checkIp: (address: string) => IpVerdict;
  isBlocked: (canonicalHost: string) => boolean;
}

/** Shared byte budget for one ingestion (40 MB). */
export class ByteBudget {
  used = 0;
  readonly limit: number;

  constructor(limit: number = LIMITS.ingestionBytes) {
    this.limit = limit;
  }

  take(bytes: number) {
    this.used += bytes;
    if (this.used > this.limit)
      throw new FetchError('too_large', `ingestion budget over ${this.limit} bytes`);
  }
}

export interface SafeFetchOptions {
  kind: BodyKind;
  signal?: AbortSignal;
  budget?: ByteBudget;
  /** Return a 3xx as is (with `location`) instead of following it. Used by the headless route. */
  singleHop?: boolean;
  headers?: Record<string, string>;
}

export interface SafeResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  /** Canonical host of every hop, for cache source tracking. */
  hosts: string[];
  /** Redirect target, single-hop mode only. */
  location?: string;
}

const TYPE_PREFIX: Record<BodyKind, readonly string[]> = {
  html: ['text/html', 'application/xhtml+xml'],
  css: ['text/css'],
  image: ['image/'],
  any: [''],
};

const USER_AGENT = 'LogisticsRunBot/1.0 (game theming; contact via site footer)';

interface Target {
  url: URL;
  host: string;
  address: ResolvedAddress;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new FetchError('aborted', 'ingestion deadline');
}

/** Validates one hop: scheme, user info, blocklist, every resolved address. */
export async function validateTarget(
  raw: string | URL,
  policy: NetPolicy,
  signal?: AbortSignal,
): Promise<Target> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError('invalid_url', 'unparseable URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('invalid_url', `scheme ${url.protocol}`);
  }
  if (url.username || url.password) throw new FetchError('invalid_url', 'user info in URL');
  const host = canonicalHost(url.hostname);
  if (!host) throw new FetchError('invalid_url', 'bad host');
  if (policy.isBlocked(host)) throw new FetchError('blocked_domain', host);

  let addresses: ResolvedAddress[];
  if (isIpLiteral(host)) {
    addresses = [{ address: host, family: host.includes(':') ? 6 : 4 }];
  } else {
    throwIfAborted(signal);
    try {
      addresses = await policy.resolve(host);
    } catch (err) {
      throw new FetchError('unreachable', `DNS ${host}: ${(err as Error).message}`);
    }
  }
  if (addresses.length === 0) throw new FetchError('unreachable', `no address for ${host}`);
  for (const a of addresses) {
    const verdict = policy.checkIp(a.address);
    if (!verdict.allowed)
      throw new FetchError('unreachable', `${host} -> ${a.address}: ${verdict.reason}`);
  }
  return { url, host, address: addresses[0]! };
}

/** Connects only to the validated address, so a second DNS answer cannot change the target. */
function pinnedAgent(target: ResolvedAddress): Agent {
  return new Agent({
    connections: 1,
    connect: {
      timeout: LIMITS.requestHeadersMs,
      lookup: (_hostname, options, callback) => {
        const opts = options as { all?: boolean };
        if (opts.all) callback(null, [{ address: target.address, family: target.family }]);
        else
          (callback as (e: null, a: string, f: number) => void)(
            null,
            target.address,
            target.family,
          );
      },
    },
  });
}

/**
 * SEC-1, SEC-2, SEC-3: GET a public http(s) URL. Every hop (max 5 redirects) is checked against
 * the scheme rule, the domain blocklist and the IP policy, and the connection is pinned to the
 * checked address. The body is streamed and capped per kind and by the shared ingestion budget.
 */
export async function safeFetch(
  raw: string,
  opts: SafeFetchOptions,
  policy: NetPolicy,
): Promise<SafeResponse> {
  const hosts: string[] = [];
  let current: string | URL = raw;
  for (let hop = 0; ; hop++) {
    throwIfAborted(opts.signal);
    const target = await validateTarget(current, policy, opts.signal);
    hosts.push(target.host);
    const agent = pinnedAgent(target.address);
    try {
      let res;
      try {
        res = await request(target.url, {
          dispatcher: agent,
          method: 'GET',
          headers: { 'user-agent': USER_AGENT, accept: '*/*', ...opts.headers },
          signal: opts.signal,
          headersTimeout: LIMITS.requestHeadersMs,
          bodyTimeout: LIMITS.requestBodyMs,
        });
      } catch (err) {
        if (opts.signal?.aborted) throw new FetchError('aborted', 'ingestion deadline');
        throw new FetchError('unreachable', `${target.host}: ${(err as Error).message}`);
      }
      const location = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && typeof location === 'string') {
        await res.body.dump();
        const next = new URL(location, target.url);
        if (opts.singleHop) {
          return {
            url: target.url.href,
            status: res.statusCode,
            contentType: '',
            headers: res.headers,
            body: Buffer.alloc(0),
            hosts,
            location: next.href,
          };
        }
        if (hop + 1 > LIMITS.maxRedirects)
          throw new FetchError('unreachable', 'too many redirects');
        current = next;
        continue;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        await res.body.dump();
        throw new FetchError('http_error', `${target.host}: HTTP ${res.statusCode}`);
      }
      const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
      if (!TYPE_PREFIX[opts.kind].some((p) => contentType.startsWith(p))) {
        await res.body.dump();
        throw new FetchError(
          'bad_type',
          `${target.host}: ${contentType || 'no content-type'} for ${opts.kind}`,
        );
      }
      const cap = LIMITS.bodyBytes[opts.kind];
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > cap) {
        res.body.destroy();
        throw new FetchError('too_large', `${target.host}: content-length ${declared} > ${cap}`);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body) {
          const buf = chunk as Buffer;
          size += buf.length;
          if (size > cap)
            throw new FetchError('too_large', `${target.host}: body over ${cap} bytes`);
          opts.budget?.take(buf.length);
          chunks.push(buf);
        }
      } catch (err) {
        res.body.destroy();
        if (err instanceof FetchError) throw err;
        if (opts.signal?.aborted) throw new FetchError('aborted', 'ingestion deadline');
        throw new FetchError('unreachable', `${target.host}: ${(err as Error).message}`);
      }
      return {
        url: target.url.href,
        status: res.statusCode,
        contentType,
        headers: res.headers,
        body: Buffer.concat(chunks),
        hosts,
      };
    } finally {
      void agent.close();
    }
  }
}
