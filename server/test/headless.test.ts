import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { html, redirect, startFixture, type FixtureServer } from './helpers/fixtureServer.ts';
import { crewAt, ingestApp, jpeg, site, type IngestTestApp } from './helpers/ingestApp.ts';
import { CANDIDATES_PER_PRIORITY } from '../src/ingest/images.ts';

let f: FixtureServer;
let inner: FixtureServer;
let t: IngestTestApp;
const byHost = new Map<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>();
const flood = { inFlight: 0, max: 0, hits: 0 };

const hostOf = (req: http.IncomingMessage) => (req.headers.host ?? '').split(':')[0]!;
const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;

beforeAll(async () => {
  f = await startFixture('127.0.0.1');
  inner = await startFixture('127.0.0.2');
  inner.route('/secret', html('secret'));
  const [a, b, c] = await Promise.all([crewAt(640), crewAt(900), crewAt(1200)]);
  f.route('/a.jpg', jpeg(a));
  f.route('/b.jpg', jpeg(b));
  f.route('/c.jpg', jpeg(c));
  f.route('/app/pic.jpg', jpeg(a));
  const imgs = (n: number) =>
    Array.from({ length: n }, (_, i) => `'<img src="/${'abc'[i % 3]}.jpg?v=${i}">'`).join('+');

  byHost.set('js.test', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(page(`<script>document.body.insertAdjacentHTML('beforeend', ${imgs(3)});</script>`));
  });
  byHost.set('js2.test', byHost.get('js.test')!);
  byHost.set('cors.test', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(
      page(`<script>
        fetch('http://api.cors.test:${f.port}/api/team.json').then((x) => x.json()).then((list) => {
          for (const u of list) document.body.insertAdjacentHTML('beforeend', '<img src="' + u + '">');
        });
      </script>`),
    );
  });
  byHost.set('api.cors.test', (_q, r) => {
    r.setHeader('content-type', 'application/json');
    r.setHeader('access-control-allow-origin', '*');
    r.end(JSON.stringify(['a', 'b', 'c'].map((n) => `http://cors.test:${f.port}/${n}.jpg`)));
  });
  byHost.set('spa.test', (req, r) => {
    r.setHeader('content-type', 'text/html');
    if (req.url === '/team')
      return r.end(page('<img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg">'));
    r.end(
      page(
        `<div id=root></div><script>root.innerHTML = '<a href="/team">Meet the team</a>';</script>`,
      ),
    );
  });
  byHost.set('ssrf.test', (_q, r) => {
    const secret = `http://127.0.0.2:${inner.port}/secret`;
    r.setHeader('content-type', 'text/html');
    r.end(
      page(
        `<img src="${secret}"><script>fetch('${secret}').catch(()=>{}); window.open('${secret}');</script>`,
      ),
    );
  });
  byHost.set('hops.test', (req, r) => {
    const m = /^\/r(\d)$/.exec(req.url ?? '');
    if (m) return redirect(`/r${Number(m[1]) + 1}`)(req, r);
    r.setHeader('content-type', 'text/html');
    r.end(page(`<script>fetch('/r0').catch(()=>{});</script>`));
  });
  byHost.set('a.test', (req, r) => redirect(`http://www.a.test:${f.port}/app/`)(req, r));
  byHost.set('www.a.test', (req, r) => {
    if (req.url === '/app/main.js') {
      r.setHeader('content-type', 'text/javascript');
      return r.end(`document.body.insertAdjacentHTML('beforeend', '<img src="pic.jpg">');`);
    }
    r.setHeader('content-type', 'text/html');
    r.end(page(`<script src="main.js"></script>`));
  });
  byHost.set('flood.test', (req, r) => {
    if ((req.url ?? '').startsWith('/f/')) {
      flood.hits++;
      flood.inFlight++;
      flood.max = Math.max(flood.max, flood.inFlight);
      setTimeout(() => {
        flood.inFlight--;
        r.end('{}');
      }, 20);
      return;
    }
    r.setHeader('content-type', 'text/html');
    r.end(
      page(`<script>
        for (let i = 0; i < 5000; i++) { const im = new Image(); im.src = '/flood-img/' + i + '.jpg'; document.body.append(im); }
        for (let i = 0; i < 5000; i++) fetch('/f/' + i).catch(() => {});
      </script>`),
    );
  });
  byHost.set('hang.test', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(page(`<script>setTimeout(() => { for (;;) {} }, 50);</script>`));
  });
  byHost.set('quick.test', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(page('<p>no faces</p>'));
  });

  const dispatch = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const h = byHost.get(hostOf(req));
    if (h) h(req, res);
    else {
      res.statusCode = 404;
      res.end();
    }
  };
  for (const p of [
    '/',
    '/team',
    '/app/',
    '/app/main.js',
    '/api/team.json',
    ...Array.from({ length: 8 }, (_, i) => `/r${i}`),
  ]) {
    f.route(p, dispatch);
  }
  for (let i = 0; i < 5000; i++) f.route(`/f/${i}`, dispatch);

  t = await ingestApp({ headlessSandbox: false, ingestionMs: 20_000 });
}, 60_000);

afterAll(async () => {
  await t?.app.close();
  await f.close();
  await inner.close();
});

describe('headless retry', () => {
  test('JS-rendered site with 0 static faces and 6 rendered: source headless', async () => {
    const r = await t.ingest(site(f, 'js.test'), '203.0.113.1');
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('headless');
    expect(r.body.faces).toHaveLength(6);
  }, 40_000);

  test('a cross-origin API answer keeps its CORS header, so the rendered team content appears', async () => {
    const r = await t.ingest(site(f, 'cors.test'), '203.0.113.11');
    expect(r.body.source).toBe('headless');
    expect(r.body.faces).toHaveLength(6);
  }, 40_000);

  test('after Chromium dies while idle, the next headless retry launches a new browser', async () => {
    expect((await t.ingest(site(f, 'js.test'), '203.0.113.12')).body.faces).toHaveLength(6);
    // Kill this process's Chromium children (the browser the runner keeps between sessions).
    const { execFileSync } = await import('node:child_process');
    const kids = execFileSync('ps', ['-o', 'pid=,comm=', '--ppid', String(process.pid)])
      .toString()
      .split('\n')
      .filter((l) => /chrom|headless_shell/i.test(l))
      .map((l) => Number(l.trim().split(/\s+/)[0]));
    expect(kids.length).toBeGreaterThan(0);
    for (const pid of kids) process.kill(pid, 'SIGKILL');
    await new Promise((res) => setTimeout(res, 500));
    const r = await t.ingest(site(f, 'js2.test'), '203.0.113.13');
    expect(r.body.source).toBe('headless');
    expect(r.body.faces).toHaveLength(6);
  }, 60_000);

  test('SPA whose /team link exists only after JavaScript: headless finds it and returns the faces', async () => {
    const r = await t.ingest(site(f, 'spa.test'), '203.0.113.2');
    expect(r.body.source).toBe('headless');
    expect(r.body.faces).toHaveLength(6);
    expect(f.hits).toContain('/team');
  }, 40_000);

  test('img, fetch() and window.open() to an internal address never reach it; the popup is closed', async () => {
    const popups = t.app.services.headlessStats!.popupsClosed;
    const r = await t.ingest(site(f, 'ssrf.test'), '203.0.113.3');
    expect(r.status).toBe(200);
    expect(inner.hits).toEqual([]);
    expect(t.app.services.headlessStats!.popupsClosed).toBeGreaterThan(popups);
  }, 40_000);

  test('a 7-hop redirect chain is aborted at hop 6', async () => {
    await t.ingest(site(f, 'hops.test'), '203.0.113.4');
    const hops = f.hits.filter((h) => /^\/r\d$/.test(h));
    expect(hops).toEqual(['/r0', '/r1', '/r2', '/r3', '/r4', '/r5']);
  }, 40_000);

  test('a redirect to /app/: relative scripts and images resolve against the final URL', async () => {
    const r = await t.ingest(site(f, 'a.test'), '203.0.113.5');
    expect(f.hits).toContain('/app/main.js');
    expect(f.hits).toContain('/app/pic.jpg');
    expect(r.body.faces.length).toBeGreaterThan(0);
  }, 40_000);

  test('5,000 <img> and 5,000 fetch(): no image fetch from Chromium, at most 200 other requests, at most 6 at once', async () => {
    const before = f.hits.length;
    await t.ingest(site(f, 'flood.test'), '203.0.113.6');
    const hits = f.hits.slice(before);
    expect(hits.filter((h) => h.startsWith('/flood-img/')).length).toBeLessThanOrEqual(150);
    expect(flood.hits).toBeLessThanOrEqual(200);
    expect(flood.hits).toBeGreaterThan(50);
    expect(flood.max).toBeLessThanOrEqual(6);
    expect(t.app.services.headlessStats!.lastRequests).toBeGreaterThan(200);
    expect(t.app.services.headlessStats!.lastImages).toBeLessThanOrEqual(
      3 * CANDIDATES_PER_PRIORITY,
    );
  }, 40_000);

  test('a page that hangs hits the deadline; no context stays open, the slot is free, the next request starts at once', async () => {
    const hang = await ingestApp({ headlessSandbox: false, ingestionMs: 4000 });
    try {
      const t0 = Date.now();
      const r = await hang.ingest(site(f, 'hang.test'), '203.0.113.7');
      expect(r.body.partial).toBe(true);
      expect(Date.now() - t0).toBeLessThan(4000 + 1500);
      await new Promise((res) => setTimeout(res, 2500));
      const stats = hang.app.services.headlessStats!;
      expect(stats.openContexts).toBe(0);
      expect(stats.activeSessions).toBe(0);
      const t1 = Date.now();
      const next = await hang.ingest(site(f, 'quick.test'), '203.0.113.8');
      expect(next.body.partial).toBe(false);
      expect(Date.now() - t1).toBeLessThan(4000);
    } finally {
      await hang.app.close();
    }
  }, 40_000);
});
