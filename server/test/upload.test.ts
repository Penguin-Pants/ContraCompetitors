import fs from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { ingestApp, singleFaces, type IngestTestApp } from './helpers/ingestApp.ts';

let t: IngestTestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

function multipart(files: { name: string; type: string; bytes: Buffer }[]) {
  const boundary = '----lrtest' + Math.random().toString(16).slice(2);
  const parts = files.map((f) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="faces"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.bytes,
      Buffer.from('\r\n'),
    ]),
  );
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function upload(
  app: IngestTestApp['app'],
  files: Parameters<typeof multipart>[0],
  ip = '198.51.100.7',
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/faces/upload',
    remoteAddress: ip,
    ...multipart(files),
  });
  return { status: res.statusCode, body: res.json() };
}

describe('upload', () => {
  test('2 JPEGs with one face each give 2 crops; nothing appears under DATA_DIR; nothing is cached', async () => {
    t = await ingestApp({ headless: null });
    const before = fs.readdirSync(t.dataDir, { recursive: true }).map(String).sort();
    const [a, b] = await singleFaces();
    const r = await upload(t.app, [
      { name: 'alice-smith.jpg', type: 'image/jpeg', bytes: a! },
      { name: 'bob.jpg', type: 'image/jpeg', bytes: b! },
    ]);
    expect(r.status).toBe(200);
    expect(r.body.faces).toHaveLength(2);
    expect(JSON.stringify(r.body)).not.toContain('alice');
    expect(fs.readdirSync(t.dataDir, { recursive: true }).map(String).sort()).toEqual(before);
    expect(t.app.services.cache.size).toBe(0);
  });

  test('a text file is rejected', async () => {
    t = await ingestApp({ headless: null });
    const r = await upload(t.app, [
      { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('upload_rejected');
  });

  test('a file over 5 MB is rejected', async () => {
    t = await ingestApp({ headless: null });
    const r = await upload(t.app, [
      { name: 'big.jpg', type: 'image/jpeg', bytes: Buffer.alloc(5 * 1024 * 1024 + 10) },
    ]);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('upload_rejected');
  });

  test('more than 10 files are rejected', async () => {
    t = await ingestApp({ headless: null });
    const [a] = await singleFaces();
    const files = Array.from({ length: 11 }, (_, i) => ({
      name: `${i}.jpg`,
      type: 'image/jpeg',
      bytes: a!,
    }));
    expect((await upload(t.app, files)).status).toBe(400);
  });

  test('detection past the deadline is upload_rejected, not a 500', async () => {
    t = await ingestApp({ headless: null, ingestionMs: 1000, pool: { testDetectDelayMs: 60_000 } });
    const [a] = await singleFaces();
    const r = await upload(t.app, [{ name: 'a.jpg', type: 'image/jpeg', bytes: a! }]);
    expect([r.status, r.body.error]).toEqual([400, 'upload_rejected']);
  }, 20_000);

  test('20 uploads per IP per hour', async () => {
    t = await ingestApp({ headless: null });
    const txt = [{ name: 'x.txt', type: 'text/plain', bytes: Buffer.from('x') }];
    for (let i = 0; i < 20; i++) expect((await upload(t.app, txt)).status).toBe(400);
    const r = await upload(t.app, txt);
    expect([r.status, r.body.error]).toEqual([429, 'rate_limited']);
  });
});
