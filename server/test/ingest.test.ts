import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { CACHE_TTL_MS } from '../src/cache/faceCache.ts';
import { redirect, startFixture, type FixtureServer } from './helpers/fixtureServer.ts';
import { crewAt, ingestApp, jpeg, photo, site, type IngestTestApp } from './helpers/ingestApp.ts';

let f: FixtureServer;
let t: IngestTestApp | undefined;
const headless = vi.fn(async () => ({ imageUrls: [], hosts: [] }));
let release: (() => void) | null = null;

beforeAll(async () => {
  f = await startFixture('127.0.0.1');
  const [a, b, c] = await Promise.all([crewAt(640), crewAt(900), crewAt(1200)]);
  f.route('/', (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    res.setHeader('content-type', 'text/html');
    if (host === 'stall.test') return; // Never answers.
    if (host === 'redirect-blocked.test') {
      res.statusCode = 302;
      res.setHeader('location', `http://cdn.blocked.test:${f.port}/`);
      return res.end();
    }
    if (host === 'slow.test') {
      // Answers only after the test calls release().
      release = () => res.end('<html><body><a href="/team">Team</a></body></html>');
      return;
    }
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/site.css">
      <style>.btn{background-color:#1e88e5}</style></head>
      <body><a href="/team">Our team</a><a href="https://elsewhere.test/team">x</a></body></html>`);
  });
  f.route('/site.css', (_q, r) => {
    r.setHeader('content-type', 'text/css');
    r.end(':root{--brand-primary:#e4002b}');
  });
  f.route('/team', (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    res.setHeader('content-type', 'text/html');
    if (host === 'bad-images.test') {
      return res.end(
        `<img src="/vector.svg?x"><img src="/fake.jpg"><img src="/huge.jpg"><img src="/a.jpg">`,
      );
    }
    if (host === 'cdn-faces.test')
      return res.end(`<img src="http://cdn.thirdparty.test:${f.port}/a.jpg">`);
    res.end(
      `<img src="/a.jpg"><img srcset="/b.jpg 900w, /a.jpg 640w"><img src="/c.jpg"><img src="/a.jpg">`,
    );
  });
  f.route('/a.jpg', jpeg(a));
  f.route('/b.jpg', jpeg(b));
  f.route('/c.jpg', jpeg(c));
  f.route('/vector.svg', (_q, r) => {
    r.setHeader('content-type', 'image/svg+xml');
    r.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });
  f.route('/fake.jpg', (_q, r) => {
    r.setHeader('content-type', 'image/jpeg');
    r.end('<html>not an image</html>');
  });
  f.route('/huge.jpg', (_q, r) => {
    r.setHeader('content-type', 'image/jpeg');
    r.end(Buffer.alloc(8 * 1024 * 1024, 1));
  });
  f.route('/nope', redirect('/'));
});

afterAll(async () => {
  await f.close();
});

afterEach(async () => {
  release?.();
  release = null;
  await t?.app.close();
  t = undefined;
  headless.mockClear();
});

const hitCount = () => f.hits.length;

describe('ingest: static path', () => {
  test('static site with 6 faces: source static, colors from CSS, no headless launch', async () => {
    t = await ingestApp({ headless });
    const { status, body } = await t.ingest(site(f, 'corp.test'));
    expect(status).toBe(200);
    expect(body.source).toBe('static');
    expect(body.partial).toBe(false);
    expect(body.domain).toBe('corp.test');
    expect(body.faces).toHaveLength(6);
    expect(new Set(body.faces.map((x) => x.id)).size).toBe(6);
    expect(body.faces[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.colors).toEqual(['#e4002b', '#1e88e5']);
    expect(headless).not.toHaveBeenCalled();
  });

  test('second request within 24 h is a cache hit and uses no rate-limit slot', async () => {
    t = await ingestApp({ headless });
    await t.ingest(site(f, 'corp.test'));
    const before = t.app.services.db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get();
    const hits = hitCount();
    const { body } = await t.ingest(site(f, 'corp.test', '/'));
    expect(body.source).toBe('cache');
    expect(body.faces).toHaveLength(6);
    expect(hitCount()).toBe(hits);
    expect(t.app.services.db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get()).toBe(
      before,
    );
  });

  test('the 6th uncached ingestion in one hour from one IP is rate_limited with no fetch; cache hits still work', async () => {
    t = await ingestApp({ headless });
    for (let i = 0; i < 5; i++)
      expect((await t.ingest(site(f, `s${i}.corp.test`))).status).toBe(200);
    const hits = hitCount();
    const sixth = await t.ingest(site(f, 's5.corp.test'));
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe('rate_limited');
    expect(hitCount()).toBe(hits);
    expect((await t.ingest(site(f, 's0.corp.test'))).body.source).toBe('cache');
    expect((await t.ingest(site(f, 's5.corp.test'), '198.51.100.99')).status).toBe(200);
  });

  test('SVG, HTML-as-image and an 8 MB image are discarded', async () => {
    t = await ingestApp({ headless });
    const { body } = await t.ingest(site(f, 'bad-images.test'));
    expect(body.faces).toHaveLength(2);
  });

  test('the headless retry charges the same byte budget and shares the 12-page cap', async () => {
    let usedAtStart = -1;
    let limit = -1;
    let pagesLeft = -1;
    t = await ingestApp({
      headless: async (_url, pages, _signal, budget) => {
        pagesLeft = pages;
        usedAtStart = budget.used;
        limit = budget.limit;
        return { imageUrls: [], hosts: [] };
      },
    });
    await t.ingest(site(f, 'bad-images.test'));
    // The static crawl already charged the homepage, CSS, team page and the decoded images.
    expect(usedAtStart).toBeGreaterThan(50_000);
    expect(limit).toBe(40 * 1024 * 1024);
    // Static read the homepage and /team: 10 left, and the headless homepage load is one of them.
    expect(pagesLeft).toBe(10);
  });

  test('invalid, internal and blocklisted URLs; invalid URLs and blocked domains use no slot', async () => {
    t = await ingestApp({ headless });
    for (const u of ['ftp://corp.test/', 'not a url', 'http://user:pw@corp.test/']) {
      const r = await t.ingest(u);
      expect([r.status, r.body.error]).toEqual([400, 'invalid_url']);
    }
    const internal = await t.ingest(`http://127.0.0.2:${f.port}/`);
    expect([internal.status, internal.body.error]).toEqual([502, 'unreachable']);
    expect(internal.body.message).toBe('The site could not be reached.');
    t.app.services.blocklist.add('blocked.test');
    const blocked = await t.ingest(site(f, 'www.BLOCKED.test.'));
    expect([blocked.status, blocked.body.error]).toEqual([403, 'blocked_domain']);
    expect(t.app.services.db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get()).toBe(1);
  });

  test('an allowed URL that redirects to a blocklisted domain gives blocked_domain and caches nothing', async () => {
    t = await ingestApp({ headless });
    t.app.services.blocklist.add('blocked.test');
    const r = await t.ingest(site(f, 'redirect-blocked.test'));
    expect([r.status, r.body.error]).toEqual([403, 'blocked_domain']);
    expect(t.app.services.cache.size).toBe(0);
  });
});

describe('ingest: deadline', () => {
  test('a site that stalls answers by the budget plus a small margin with partial: true', async () => {
    t = await ingestApp({ headless, ingestionMs: 1500 });
    const t0 = Date.now();
    const { status, body } = await t.ingest(site(f, 'stall.test'));
    expect(Date.now() - t0).toBeLessThan(1500 + 1000);
    expect(status).toBe(200);
    expect(body.partial).toBe(true);
    expect(body.faces).toEqual([]);
    expect(t.app.services.cache.size).toBe(0);
  });

  test('a detector that sleeps 60 s: partial by the deadline, worker replaced, next job on a fresh worker', async () => {
    t = await ingestApp({
      headless,
      ingestionMs: 2500,
      pool: { size: 1, testDetectDelayMs: 60_000 },
    });
    const t0 = Date.now();
    const { body } = await t.ingest(site(f, 'corp.test'));
    expect(Date.now() - t0).toBeLessThan(2500 + 1500);
    expect(body.partial).toBe(true);
    expect(body.colors).toEqual(['#e4002b', '#1e88e5']);
    // The worker that held the slow job was terminated: the next job starts at once on a fresh one.
    const t1 = Date.now();
    await expect(t.app.services.detect(photo('gemini7-crew.jpg'), 300)).rejects.toThrow();
    expect(Date.now() - t1).toBeLessThan(2000);
  });
});

describe('cache lifetime and purge', () => {
  test('sweeper deletes an entry at +23 h 1 min; no entry outlives 23 h 1 min over a simulated 48 h', async () => {
    t = await ingestApp({ headless });
    const { cache, minuteJob } = t.app.services;
    const start = t.now.value;
    let maxAge = 0;
    for (let minute = 0; minute <= 48 * 60; minute++) {
      t.now.value = start + minute * 60_000;
      // A new domain every 3 hours, from a fresh IP.
      if (minute % 180 === 0)
        await t.ingest(site(f, `m${minute}.corp.test`), `203.0.113.${minute / 180 + 1}`);
      maxAge = Math.max(maxAge, ...cache.ages(t.now.value));
      minuteJob.runOnce();
      if (minute === 23 * 60 + 1) expect(cache.keys()).not.toContain('m0.corp.test');
      if (minute === 23 * 60 - 1) expect(cache.keys()).toContain('m0.corp.test');
    }
    expect(maxAge).toBeGreaterThan(CACHE_TTL_MS - 60_000);
    expect(maxAge).toBeLessThanOrEqual(CACHE_TTL_MS + 60_000);
  }, 30_000);

  test('after an app restart the cache is empty and DATA_DIR holds no face data', async () => {
    t = await ingestApp({ headless });
    const dataDir = t.dataDir;
    await t.ingest(site(f, 'corp.test'));
    await t.app.close();
    t = await ingestApp({ headless }, dataDir);
    expect(t.app.services.cache.size).toBe(0);
    const files = fs.readdirSync(dataDir, { recursive: true }).map(String);
    expect(files.filter((x) => !/^app\.db(-wal|-shm)?$/.test(x))).toEqual([]);
    const db = t.app.services.db;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").pluck().all();
    expect(tables.sort()).toEqual(['blocklist', 'rate_events', 'schema_migrations', 'scores']);
    for (const file of files.filter((x) => x.startsWith('app.db'))) {
      const bytes = fs.readFileSync(path.join(dataDir, file));
      expect(bytes.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
      expect(bytes.includes(Buffer.from('data:image/png'))).toBe(false);
    }
  });

  test('a face from a blocked third-party host purges the company entry on the next sweep', async () => {
    t = await ingestApp({ headless });
    const r = await t.ingest(site(f, 'cdn-faces.test'));
    expect(r.body.faces).toHaveLength(2);
    expect(t.app.services.cache.keys()).toEqual(['cdn-faces.test']);
    t.app.services.blocklist.add('thirdparty.test');
    t.app.services.minuteJob.runOnce();
    expect(t.app.services.cache.size).toBe(0);
  });

  test('example.com and www.example.com: purge follows the blocklist matching rule', async () => {
    t = await ingestApp({ headless });
    await t.ingest(site(f, 'example.test'));
    await t.ingest(site(f, 'www.example.test'));
    const { cache, blocklist, minuteJob } = t.app.services;
    expect(cache.keys().sort()).toEqual(['example.test', 'www.example.test']);
    blocklist.add('www.example.test');
    expect((await t.ingest(site(f, 'www.example.test'))).body.error).toBe('blocked_domain');
    minuteJob.runOnce();
    expect(cache.keys()).toEqual(['example.test']);
    blocklist.add('example.test');
    minuteJob.runOnce();
    expect(cache.size).toBe(0);
  });

  test('a block added while a pipeline is in flight: that request returns blocked_domain and caches nothing', async () => {
    t = await ingestApp({ headless });
    const pending = t.ingest(site(f, 'slow.test'));
    await vi.waitFor(() => expect(release).not.toBeNull());
    t.app.services.blocklist.add('slow.test');
    release!();
    release = null;
    const r = await pending;
    expect(r.body.error).toBe('blocked_domain');
    expect((await t.ingest(site(f, 'slow.test'))).body.error).toBe('blocked_domain');
    t.app.services.minuteJob.runOnce();
    expect(t.app.services.cache.size).toBe(0);
  });
});
