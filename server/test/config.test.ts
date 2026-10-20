import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';

const base = { CONTACT_EMAIL: 'takedown@example.com', SOURCE_URL: 'https://example.com/src' };

describe('loadConfig', () => {
  test('defaults', () => {
    const c = loadConfig({ ...base });
    expect(c).toMatchObject({
      port: 3000,
      host: '0.0.0.0',
      trustProxyHops: 0,
      contactEmail: 'takedown@example.com',
      sourceUrl: 'https://example.com/src',
      dataDir: path.resolve('./data'),
    });
    expect(path.isAbsolute(c.clientDist!)).toBe(true);
  });

  test('reads every value', () => {
    const c = loadConfig({
      ...base,
      PORT: '8080',
      HOST: '127.0.0.1',
      DATA_DIR: '/tmp/lr-data',
      TRUST_PROXY_HOPS: '1',
    });
    expect(c).toMatchObject({
      port: 8080,
      host: '127.0.0.1',
      dataDir: '/tmp/lr-data',
      trustProxyHops: 1,
    });
  });

  test.each(['0', '65535'])('PORT %s is accepted', (p) => {
    expect(loadConfig({ ...base, PORT: p }).port).toBe(Number(p));
  });

  test.each(['-1', '65536', '80.5', 'abc', '3000x'])('PORT %s is a ConfigError', (p) => {
    expect(() => loadConfig({ ...base, PORT: p })).toThrow(ConfigError);
  });

  test.each(['-1', '11', '1.5', 'x'])('TRUST_PROXY_HOPS %s is a ConfigError', (h) => {
    expect(() => loadConfig({ ...base, TRUST_PROXY_HOPS: h })).toThrow(ConfigError);
  });

  test.each([
    [{ CONTACT_EMAIL: undefined }],
    [{ CONTACT_EMAIL: 'mailto:takedown@example.com' }],
    [{ SOURCE_URL: undefined }],
    [{ SOURCE_URL: 'http://example.com/src' }],
  ])('missing or bad meta value %j is a ConfigError', (over) => {
    expect(() => loadConfig({ ...base, ...over })).toThrow(ConfigError);
  });
});
