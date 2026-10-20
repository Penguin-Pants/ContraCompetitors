import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from 'playwright';
import type { FastifyBaseLogger } from 'fastify';
import { ByteBudget, FetchError, safeFetch, type NetPolicy } from '../net/safeFetch.ts';
import { LIMITS } from '../net/limits.ts';
import { scanHtml, selectPages, type ImageCandidate, type PageKind } from './crawl.ts';
import { CandidateSet } from './images.ts';
import type { HeadlessResult, HeadlessRun } from './pipeline.ts';

export const MAX_SESSIONS = 2;
/** Non-image requests per ingestion inside the browser. */
export const REQUEST_CAP = 200;
export const MAX_IN_FLIGHT = 6;
const CLOSE_TIMEOUT_MS = 2000;
const SETTLE_MS = 1500;
const SKIPPED_TYPES = new Set(['image', 'media', 'font']);

export interface HeadlessOptions {
  net: NetPolicy;
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>;
  /** Chromium sandbox. Production keeps it on and never passes --no-sandbox. Tests may turn it off. */
  sandbox?: boolean;
}

export interface HeadlessRunner {
  run: HeadlessRun;
  close(): Promise<void>;
  /** Live counters for tests. */
  stats: {
    openContexts: number;
    activeSessions: number;
    queued: number;
    /** Highest in-flight count seen in any session. */
    maxInFlight: number;
    /** Non-image requests of the last session. */
    lastRequests: number;
    /** Distinct image candidates of the last session. */
    lastImages: number;
    popupsClosed: number;
  };
}

class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get count(): number {
    return this.active;
  }

  get waiting(): number {
    return this.waiters.length;
  }

  async acquire(signal: AbortSignal): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal.removeEventListener('abort', stop);
        this.active++;
        resolve();
      };
      const stop = () => {
        const i = this.waiters.indexOf(go);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new FetchError('aborted', 'deadline while queued'));
      };
      this.waiters.push(go);
      signal.addEventListener('abort', stop, { once: true });
    });
  }

  release() {
    this.active--;
    this.waiters.shift()?.();
  }
}

/** Rejects when the signal aborts, so a hung page call cannot outlive the deadline. */
function untilAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new FetchError('aborted', 'deadline'));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new FetchError('aborted', 'deadline'));
    signal.addEventListener('abort', stop, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', stop);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', stop);
        reject(e);
      },
    );
  });
}

/** A popup's first request has no frame yet; Playwright throws for it. It is never the main frame. */
function isMainNavigation(req: Request, page: Page | null): boolean {
  if (!page || !req.isNavigationRequest()) return false;
  try {
    return req.frame() === page.mainFrame();
  } catch {
    return false;
  }
}

/**
 * ING-6 headless retry in Playwright Chromium. Every browser request is fulfilled by safeFetch, so
 * the SSRF rules and the blocklist apply to the browser too. Images, media and fonts are never
 * fetched by the browser: their URLs are recorded for the capped image queue.
 *
 * Redirects: Chromium does not send the request that follows a fulfilled 3xx back through the
 * route (it would go to the dead proxy and fail). So a main-frame navigation runs in single-hop
 * mode and the runner itself navigates to the `location` (max 5 hops), which keeps the document
 * URL equal to the real final URL. Subresources follow redirects inside safeFetch, which checks
 * every hop and stops at 5.
 */
export function createHeadless(opts: HeadlessOptions): HeadlessRunner {
  const sessions = new Semaphore(MAX_SESSIONS);
  const stats = {
    openContexts: 0,
    activeSessions: 0,
    queued: 0,
    maxInFlight: 0,
    lastRequests: 0,
    lastImages: 0,
    popupsClosed: 0,
  };
  let browser: Promise<Browser> | null = null;

  const launch = () =>
    (browser ??= chromium
      .launch({
        chromiumSandbox: opts.sandbox ?? true,
        // Any request that escapes routing goes to a dead local port and fails.
        proxy: { server: 'http://127.0.0.1:9' },
        args: [
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        ],
      })
      .catch((err) => {
        browser = null;
        throw err;
      }));

  const relaunch = async () => {
    const b = browser;
    browser = null;
    try {
      await (await b)?.close();
    } catch {
      // Already gone.
    }
  };

  async function session(
    url: string,
    pagesLeft: number,
    signal: AbortSignal,
    budget: ByteBudget,
  ): Promise<HeadlessResult> {
    const b = await untilAbort(launch(), signal);
    const images = new CandidateSet();
    const addImage = (c: ImageCandidate) => {
      images.add(c);
      stats.lastImages = images.size;
    };
    const result = (): HeadlessResult => ({
      imageUrls: images.list(),
      hosts: [...hosts],
    });
    const hosts = new Set<string>();
    let currentKind: PageKind = 'home';
    let inFlight = 0;
    let requests = 0;
    const flight: (() => void)[] = [];
    let allowNextPage = true;
    let page: Page | null = null;
    /** Set by the route when the main-frame navigation answered with a redirect. */
    let redirectTo: string | null = null;

    const context: BrowserContext = await b.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    stats.openContexts++;
    let closed = false;
    const closeContext = async () => {
      if (closed) return;
      closed = true;
      stats.openContexts--;
      const ok = await Promise.race([
        context.close().then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((r) => setTimeout(() => r(false), CLOSE_TIMEOUT_MS)),
      ]);
      if (!ok) await relaunch();
    };

    try {
      // Routing is installed before any page exists, so popups and their first request are covered.
      await context.routeWebSocket(/.*/, (ws) => ws.close());
      await context.route('**/*', async (route: Route, req: Request) => {
        const abort = () => route.abort('blockedbyclient').catch(() => {});
        if (SKIPPED_TYPES.has(req.resourceType())) {
          if (req.resourceType() === 'image')
            addImage({ url: req.url(), priority: currentKind === 'team' ? 1 : 0 });
          return abort();
        }
        if (req.method() !== 'GET' || signal.aborted) return abort();
        const mainNavigation = isMainNavigation(req, page);
        // Per ingestion: each session has its own counter.
        stats.lastRequests = ++requests;
        if (requests > REQUEST_CAP) return abort();
        if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => flight.push(r));
        inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
        try {
          const res = await safeFetch(
            req.url(),
            { kind: 'any', singleHop: mainNavigation, signal, budget },
            opts.net,
          );
          for (const h of res.hosts) hosts.add(h);
          if (res.location) {
            redirectTo = res.location;
            await abort();
          } else {
            await route.fulfill({
              status: res.status,
              headers: res.contentType ? { 'content-type': res.contentType } : {},
              body: res.body,
            });
          }
        } catch {
          await abort();
        } finally {
          inFlight--;
          flight.shift()?.();
        }
      });
      context.on('page', (p) => {
        if (allowNextPage) {
          allowNextPage = false;
          return;
        }
        stats.popupsClosed++;
        void p.close().catch(() => {});
      });
      const tab: Page = await untilAbort(context.newPage(), signal);
      page = tab;

      const seen = new Set<string>([url]);
      const visit = async (target: string, kind: PageKind) => {
        currentKind = kind;
        let next = target;
        for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
          redirectTo = null;
          await untilAbort(
            tab.goto(next, { waitUntil: 'load', timeout: LIMITS.ingestionMs }),
            signal,
          ).catch((err) => {
            if (signal.aborted) throw err;
          });
          if (!redirectTo) break;
          next = redirectTo;
        }
        await untilAbort(
          tab.waitForLoadState('networkidle', { timeout: SETTLE_MS }).catch(() => {}),
          signal,
        );
        const html = await untilAbort(tab.content(), signal);
        const scan = scanHtml(html, tab.url(), kind);
        scan.images.forEach(addImage);
        return scan;
      };

      const home = await visit(url, 'home');
      seen.add(tab.url());
      const pages = selectPages(home.links, tab.url(), seen).slice(0, Math.max(0, pagesLeft - 1));
      for (const p of pages) {
        if (signal.aborted) break;
        seen.add(p.url);
        await visit(p.url, p.kind);
      }
      return result();
    } catch (err) {
      // On the deadline, return whatever was found; the pipeline reads it.
      if (!signal.aborted)
        opts.log.warn({ err: (err as Error).message }, 'headless session failed');
      return result();
    } finally {
      await closeContext();
    }
  }

  const run: HeadlessRun = async (url, pagesLeft, signal, budget) => {
    stats.queued++;
    try {
      await sessions.acquire(signal);
    } finally {
      stats.queued--;
    }
    stats.activeSessions++;
    try {
      return await session(url, pagesLeft, signal, budget);
    } catch (err) {
      if (!signal.aborted) opts.log.error({ err }, 'headless launch failed');
      return { imageUrls: [], hosts: [] };
    } finally {
      stats.activeSessions--;
      sessions.release();
    }
  };

  return {
    run,
    stats,
    close: async () => {
      await relaunch();
    },
  };
}
