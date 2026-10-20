import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.ts';
import { testConfig } from './helpers/app.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
});

test('GET /api/health returns 200', async () => {
  app = await createApp(testConfig(), { logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
});

test('an unknown /api route is a not_found error body; other paths keep a plain 404', async () => {
  app = await createApp(testConfig(), { logger: false });
  const api = await app.inject({ method: 'GET', url: '/api/unknown' });
  expect(api.statusCode).toBe(404);
  expect(api.json()).toEqual({ error: 'not_found', message: 'Not found' });
  const page = await app.inject({ method: 'GET', url: '/no-such-file.js' });
  expect(page.statusCode).toBe(404);
  expect(page.headers['content-type']).toMatch(/^text\/plain/);
});

test('a 429 from a route is rate_limited; other 4xx stay bad_request', async () => {
  app = await createApp(testConfig(), { logger: false });
  app.get('/api/test-429', async () => {
    throw Object.assign(new Error('slow down'), { statusCode: 429 });
  });
  app.get('/api/test-413', async () => {
    throw Object.assign(new Error('too big'), { statusCode: 413 });
  });
  const r429 = await app.inject({ method: 'GET', url: '/api/test-429' });
  expect([r429.statusCode, r429.json().error]).toEqual([429, 'rate_limited']);
  const r413 = await app.inject({ method: 'GET', url: '/api/test-413' });
  expect([r413.statusCode, r413.json().error]).toEqual([413, 'bad_request']);
});
