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
