import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { checkAddress } from '../src/net/ipPolicy.ts';
import {
  ByteBudget,
  FetchError,
  safeFetch,
  type NetPolicy,
  type ResolvedAddress,
} from '../src/net/safeFetch.ts';
import { html, redirect, startFixture, type FixtureServer } from './helpers/fixtureServer.ts';

let site: FixtureServer;
let inner: FixtureServer;

beforeAll(async () => {
  site = await startFixture('127.0.0.1');
  inner = await startFixture('127.0.0.2');
  inner.route('/secret', html('secret'));
  site.route('/ok', html('<p>ok</p>'));
  site.route('/to-metadata', redirect('http://169.254.169.254/latest/meta-data/'));
  site.route('/to-inner', redirect(`http://127.0.0.2:${inner.port}/secret`));
  site.route('/to-blocked', redirect(`http://cdn.blocked.test:${site.port}/ok`));
  site.route('/style', (_q, r) => {
    r.setHeader('content-type', 'text/css');
    r.end('a{}');
  });
  site.route('/big', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.write('x'.repeat(3 * 1024 * 1024));
    r.end();
  });
  site.route('/big-declared', (_q, r) => {
    r.setHeader('content-type', 'text/html');
    r.setHeader('content-length', String(3 * 1024 * 1024));
    r.end('x'.repeat(3 * 1024 * 1024));
  });
  for (let i = 0; i < 7; i++) site.route(`/hop${i}`, redirect(`/hop${i + 1}`));
  site.route('/hop7', html('end'));
  site.route('/bad-location', redirect('http://[bad'));
  // Bodies that never end, on answers safeFetch does not read (redirect, error, wrong type).
  const drip =
    (status: number, headers: Record<string, string>) =>
    (_q: unknown, r: import('node:http').ServerResponse) => {
      r.writeHead(status, headers);
      const t = setInterval(() => r.write('x'), 50);
      r.on('close', () => clearInterval(t));
    };
  site.route('/drip-redirect', drip(302, { location: '/ok' }));
  site.route('/drip-404', drip(404, { 'content-type': 'text/html' }));
  site.route('/drip-type', drip(200, { 'content-type': 'text/css' }));
});

afterAll(async () => {
  await site.close();
  await inner.close();
});

/** Test policy: the fixture at 127.0.0.1 is reachable; everything else follows production rules. */
function policy(over: Partial<NetPolicy> = {}, map: Record<string, string[]> = {}): NetPolicy {
  return {
    resolve: async (host): Promise<ResolvedAddress[]> => {
      const ips = map[host] ?? ['127.0.0.1'];
      return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    checkIp: (ip) => (ip === '127.0.0.1' ? { allowed: true } : checkAddress(ip)),
    isBlocked: (host) => host === 'blocked.test' || host.endsWith('.blocked.test'),
    ...over,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (err) {
    if (err instanceof FetchError) return err.code;
    throw err;
  }
}

const url = (path: string, host = 'site.test') => `http://${host}:${site.port}${path}`;

describe('safeFetch', () => {
  test('fetches an allowed page and records the hop hosts', async () => {
    const res = await safeFetch(url('/ok'), { kind: 'html' }, policy());
    expect(res.body.toString()).toBe('<p>ok</p>');
    expect(res.hosts).toEqual(['site.test']);
  });

  test('a hostname resolving to 127.0.0.1 is rejected with the production policy and never connects', async () => {
    const before = site.hits.length;
    const prod = policy({ checkIp: checkAddress });
    expect(await code(safeFetch(url('/ok', 'evil.test'), { kind: 'html' }, prod))).toBe(
      'unreachable',
    );
    expect(await code(safeFetch(`http://127.0.0.1:${site.port}/ok`, { kind: 'html' }, prod))).toBe(
      'unreachable',
    );
    expect(await code(safeFetch(`http://[::1]:${site.port}/ok`, { kind: 'html' }, prod))).toBe(
      'unreachable',
    );
    expect(site.hits.length).toBe(before);
  });

  test('a DNS answer with one private address among public ones is rejected', async () => {
    const p = policy({}, { 'mixed.test': ['127.0.0.1', '10.0.0.5'] });
    expect(await code(safeFetch(url('/ok', 'mixed.test'), { kind: 'html' }, p))).toBe(
      'unreachable',
    );
  });

  test('a public URL that redirects to http://169.254.169.254/ is rejected at the hop', async () => {
    expect(await code(safeFetch(url('/to-metadata'), { kind: 'html' }, policy()))).toBe(
      'unreachable',
    );
  });

  test('a redirect to a private address never reaches it', async () => {
    const before = inner.hits.length;
    expect(await code(safeFetch(url('/to-inner'), { kind: 'html' }, policy()))).toBe('unreachable');
    expect(inner.hits.length).toBe(before);
  });

  test('an allowed URL that redirects to a blocklisted domain gives blocked_domain', async () => {
    expect(await code(safeFetch(url('/to-blocked'), { kind: 'html' }, policy()))).toBe(
      'blocked_domain',
    );
    expect(await code(safeFetch(url('/ok', 'BLOCKED.test.'), { kind: 'html' }, policy()))).toBe(
      'blocked_domain',
    );
  });

  test('DNS rebinding: a resolver that answers public then private never connects to the private address', async () => {
    let calls = 0;
    const p = policy({
      resolve: async () => {
        calls++;
        return [{ address: calls % 2 === 1 ? '127.0.0.1' : '127.0.0.2', family: 4 }];
      },
    });
    const before = inner.hits.length;
    const res = await safeFetch(url('/ok', 'rebind.test'), { kind: 'html' }, p);
    expect(res.body.toString()).toBe('<p>ok</p>');
    expect(await code(safeFetch(url('/ok', 'rebind.test'), { kind: 'html' }, p))).toBe(
      'unreachable',
    );
    expect(inner.hits.length).toBe(before);
  });

  test.each([
    'ftp://site.test/file',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://user:pass@site.test/',
    'http://user@site.test/',
    'not a url',
  ])('%s is rejected as invalid_url', async (raw) => {
    expect(await code(safeFetch(raw, { kind: 'html' }, policy()))).toBe('invalid_url');
  });

  test('a 3 MB HTML body aborts at the 2 MB cap (streamed and declared)', async () => {
    expect(await code(safeFetch(url('/big'), { kind: 'html' }, policy()))).toBe('too_large');
    expect(await code(safeFetch(url('/big-declared'), { kind: 'html' }, policy()))).toBe(
      'too_large',
    );
  });

  test('the shared ingestion budget stops later fetches', async () => {
    const budget = new ByteBudget(12);
    await safeFetch(url('/ok'), { kind: 'html', budget }, policy());
    expect(await code(safeFetch(url('/ok'), { kind: 'html', budget }, policy()))).toBe('too_large');
  });

  test('a spent byte budget refuses the next fetch before it connects', async () => {
    const budget = new ByteBudget(100);
    budget.used = 100;
    const before = site.hits.length;
    expect(await code(safeFetch(url('/ok'), { kind: 'html', budget }, policy()))).toBe('too_large');
    expect(site.hits.length).toBe(before);
  });

  test('5 redirects are followed; the 6th is rejected', async () => {
    const res = await safeFetch(url('/hop2'), { kind: 'html' }, policy());
    expect(res.body.toString()).toBe('end');
    expect(await code(safeFetch(url('/hop1'), { kind: 'html' }, policy()))).toBe('unreachable');
  });

  test('an unparseable Location header is unreachable, not a TypeError', async () => {
    expect(await code(safeFetch(url('/bad-location'), { kind: 'html' }, policy()))).toBe(
      'unreachable',
    );
    expect(
      await code(safeFetch(url('/bad-location'), { kind: 'any', singleHop: true }, policy())),
    ).toBe('unreachable');
  });

  test('an unread body (redirect, error status, wrong type) is dropped at once, not drained', async () => {
    const t0 = Date.now();
    expect(
      (await safeFetch(url('/drip-redirect'), { kind: 'html' }, policy())).body.toString(),
    ).toBe('<p>ok</p>');
    expect(await code(safeFetch(url('/drip-404'), { kind: 'html' }, policy()))).toBe('http_error');
    expect(await code(safeFetch(url('/drip-type'), { kind: 'html' }, policy()))).toBe('bad_type');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  test('when the first validated address refuses, the next validated address is tried', async () => {
    const p = policy(
      { checkIp: (ip) => (ip.startsWith('127.0.0.') ? { allowed: true } : checkAddress(ip)) },
      { 'dual.test': ['127.0.0.3', '127.0.0.1'] },
    );
    const res = await safeFetch(url('/ok', 'dual.test'), { kind: 'html' }, p);
    expect(res.body.toString()).toBe('<p>ok</p>');
  });

  test('single-hop mode returns the 3xx with its location', async () => {
    const res = await safeFetch(url('/hop0'), { kind: 'html', singleHop: true }, policy());
    expect(res.status).toBe(302);
    expect(res.location).toBe(url('/hop1'));
  });

  test('a content type that does not match the kind is rejected', async () => {
    expect(await code(safeFetch(url('/style'), { kind: 'html' }, policy()))).toBe('bad_type');
    expect(await code(safeFetch(url('/ok'), { kind: 'image' }, policy()))).toBe('bad_type');
    expect((await safeFetch(url('/style'), { kind: 'css' }, policy())).body.toString()).toBe('a{}');
  });

  test('an aborted signal stops the fetch', async () => {
    const ctl = new AbortController();
    ctl.abort();
    expect(await code(safeFetch(url('/ok'), { kind: 'html', signal: ctl.signal }, policy()))).toBe(
      'aborted',
    );
  });
});
