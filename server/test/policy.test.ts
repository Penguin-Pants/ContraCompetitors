import { execFileSync } from 'node:child_process';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db/db.ts';
import { canonicalHost } from '../src/net/hostname.ts';
import { Blocklist } from '../src/policy/blocklist.ts';
import { hashIp, HOUR_MS, RateLimiter, rateKey } from '../src/policy/rateLimit.ts';
import { tempDir, testConfig } from './helpers/app.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');

function blocklist() {
  return new Blocklist(openDb(tempDir()));
}

const check = (b: Blocklist, host: string) => b.isBlocked(canonicalHost(host)!);

describe('blocklist', () => {
  test('example.com blocks its canonical forms and subdomains but not notexample.com', () => {
    const b = blocklist();
    b.add('example.com');
    for (const h of [
      'example.com',
      'www.example.com',
      'EXAMPLE.com',
      'example.com.',
      'www.example.com..',
    ]) {
      expect(check(b, h)).toBe(true);
    }
    expect(check(b, 'notexample.com')).toBe(false);
    expect(check(b, 'example.org')).toBe(false);
  });

  test('an IDN entry matches its Unicode and punycode request forms', () => {
    const b = blocklist();
    b.add('bücher.example');
    expect(check(b, 'bücher.example')).toBe(true);
    expect(check(b, 'xn--bcher-kva.example')).toBe(true);
    expect(check(b, 'shop.BÜCHER.example')).toBe(true);
  });

  test('remove and invalid entries', () => {
    const b = blocklist();
    expect(b.add('a..b')).toBeNull();
    b.add('x.test');
    expect(b.remove('X.TEST.')).toBe(true);
    expect(b.list()).toEqual([]);
  });

  test('CLI add Example.COM. stores example.com', () => {
    const dataDir = tempDir();
    const run = (...args: string[]) =>
      execFileSync(process.execPath, ['server/src/cli/blocklist.ts', ...args], {
        cwd: ROOT,
        env: { ...process.env, DATA_DIR: dataDir },
        encoding: 'utf8',
      });
    expect(run('add', 'Example.COM.')).toContain('Blocked example.com');
    expect(run('list').trim()).toBe('example.com');
    const db = new Database(path.join(dataDir, 'app.db'));
    expect(db.prepare('SELECT domain FROM blocklist').pluck().all()).toEqual(['example.com']);
    db.close();
    expect(run('remove', 'example.com')).toContain('Removed');
    expect(() => run('add', 'a..b')).toThrow();
  });
});

describe('rate limit', () => {
  test('5 per IP per hour; the 6th is refused and uses no slot; the window slides', () => {
    let now = 0;
    const db = openDb(tempDir());
    const limiter = new RateLimiter(db, 'ingest', 5, () => now);
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume('203.0.113.7')).toBe(true);
      now += 1000;
    }
    expect(limiter.tryConsume('203.0.113.7')).toBe(false);
    expect(limiter.tryConsume('198.51.100.1')).toBe(true);
    now = HOUR_MS + 1;
    expect(limiter.tryConsume('203.0.113.7')).toBe(true);
    expect(db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get()).toBeLessThanOrEqual(6);
  });

  test.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::ffff', '2001:db8:1:2::/64'],
    ['2001:db8:1:3::1', '2001:db8:1:3::/64'],
  ])('rate key of %s is %s', (ip, key) => {
    expect(rateKey(ip)).toBe(key);
  });

  test('rotating IPv6 addresses inside one /64 shares one budget; IPv4-mapped shares with IPv4', () => {
    const db = openDb(tempDir());
    const limiter = new RateLimiter(db, 'ingest', 5, () => 0);
    for (let i = 1; i <= 5; i++) expect(limiter.tryConsume(`2001:db8:1:2::${i}`)).toBe(true);
    expect(limiter.tryConsume('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(false);
    expect(limiter.tryConsume('2001:db8:1:3::1')).toBe(true);
    for (let i = 0; i < 5; i++) expect(limiter.tryConsume('203.0.113.9')).toBe(true);
    expect(limiter.tryConsume('::ffff:203.0.113.9')).toBe(false);
  });

  test('stores a SHA-256 of the IP, never the IP', () => {
    const db = openDb(tempDir());
    new RateLimiter(db, 'ingest', 5, () => 0).tryConsume('203.0.113.7');
    const row = db.prepare('SELECT ip_hash FROM rate_events').get() as { ip_hash: string };
    expect(row.ip_hash).toBe(hashIp('203.0.113.7'));
    expect(row.ip_hash).not.toContain('203.0.113.7');
  });

  test('1,000 ingestions from 1,000 IPs, then clock +61 min and one sweep: rate_events is empty', async () => {
    let now = 5_000_000;
    const config = testConfig();
    const app = await createApp(config, { logger: false, clock: () => now });
    for (let i = 0; i < 1000; i++)
      app.services.ingestLimiter.tryConsume(`10.0.${i >> 8}.${i & 255}`);
    const db = app.services.db;
    expect(db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get()).toBe(1000);
    now += 61 * 60 * 1000;
    app.services.minuteJob.runOnce();
    expect(db.prepare('SELECT COUNT(*) FROM rate_events').pluck().get()).toBe(0);
    await app.close();
  });
});

describe('trust proxy', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });

  test.each([
    [0, '127.0.0.1'],
    [1, '203.0.113.9'],
  ])('TRUST_PROXY_HOPS=%i gives request.ip %s', async (hops, ip) => {
    app = await createApp(testConfig({ trustProxyHops: hops }), { logger: false });
    app.get('/test-ip', async (req) => ({ ip: req.ip }));
    const res = await app.inject({
      method: 'GET',
      url: '/test-ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' },
    });
    expect(res.json().ip).toBe(ip);
  });
});
