import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.ts';
import { ConfigError, loadConfig } from '../src/config.ts';
import { tempDir, testConfig } from './helpers/app.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

function dist(): string {
  const dir = tempDir('lr-dist-');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    '<!doctype html><html><head><title>t</title></head><body></body></html>',
  );
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
  return dir;
}

const VALID = {
  CONTACT_EMAIL: 'takedown@example.com',
  SOURCE_URL: 'https://github.com/Penguin-Pants/ContraCompetitors',
};

describe('index.html meta tags', () => {
  test('GET / returns both meta tags with the configured values', async () => {
    app = await createApp(
      testConfig({
        clientDist: dist(),
        contactEmail: 'ops@corp.test',
        sourceUrl: 'https://src.test/repo?a=1&b="2"',
      }),
      { logger: false },
    );
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<meta name="contact-email" content="ops@corp.test" />');
    expect(res.body).toContain(
      '<meta name="source-url" content="https://src.test/repo?a=1&amp;b=&quot;2&quot;" />',
    );
    const asset = await app.inject({ method: 'GET', url: '/app.js' });
    expect(asset.statusCode).toBe(200);
  });
});

describe('startup config', () => {
  test('valid values load', () => {
    const c = loadConfig({ ...VALID });
    expect(c.contactEmail).toBe(VALID.CONTACT_EMAIL);
    expect(c.sourceUrl).toBe(VALID.SOURCE_URL);
  });

  test.each([
    ['CONTACT_EMAIL missing', { SOURCE_URL: VALID.SOURCE_URL }],
    ['SOURCE_URL missing', { CONTACT_EMAIL: VALID.CONTACT_EMAIL }],
    ['CONTACT_EMAIL with a mailto: scheme', { ...VALID, CONTACT_EMAIL: 'mailto:x@y.z' }],
    ['CONTACT_EMAIL not an address', { ...VALID, CONTACT_EMAIL: 'takedown' }],
    ['SOURCE_URL not https', { ...VALID, SOURCE_URL: 'http://github.com/x' }],
    ['SOURCE_URL not a URL', { ...VALID, SOURCE_URL: 'github.com/x' }],
  ])('%s fails', (_name, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });
});
