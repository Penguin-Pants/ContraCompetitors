import { afterAll, beforeAll, expect, test } from 'vitest';
import { startFixture, type FixtureServer } from './helpers/fixtureServer.ts';
import { crewAt, ingestApp, site } from './helpers/ingestApp.ts';

let f: FixtureServer;
let inFlight = 0;
let maxInFlight = 0;
let imageRequests = 0;

beforeAll(async () => {
  f = await startFixture('127.0.0.1');
  const face = await crewAt(320);
  const imgs = Array.from({ length: 5000 }, (_, i) => `<img src="/img/${i}.jpg">`).join('');
  f.route('/', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(`<html><body><a href="/team">Team</a>${imgs}</body></html>`);
  });
  f.route('/team', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end(`<html><body>${imgs}</body></html>`);
  });
  for (let i = 0; i < 5000; i++) {
    f.route(`/img/${i}.jpg`, (_q, r) => {
      imageRequests++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight--;
        r.setHeader('content-type', 'image/jpeg');
        // Every image is the same face, so dedupe keeps the run going until the cap.
        r.end(i % 50 === 0 ? face : Buffer.from('not an image'));
      }, 5);
    });
  }
});

afterAll(async () => {
  await f.close();
});

test('a page with 5,000 <img> tags makes at most 150 image requests, never more than 4 at once', async () => {
  const t = await ingestApp({ headless: null });
  const r = await t.ingest(site(f, 'many.test'));
  expect(r.status).toBe(200);
  expect(imageRequests).toBeLessThanOrEqual(150);
  expect(imageRequests).toBeGreaterThan(100);
  expect(maxInFlight).toBeLessThanOrEqual(4);
  expect(maxInFlight).toBeGreaterThan(1);
  await t.app.close();
}, 30_000);
