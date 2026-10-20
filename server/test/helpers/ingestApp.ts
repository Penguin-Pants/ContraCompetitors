import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import type { IngestResponse } from '@lr/shared/api';
import { createApp, type AppDeps } from '../../src/app.ts';
import { checkAddress } from '../../src/net/ipPolicy.ts';
import { testConfig } from './app.ts';
import type { FixtureServer } from './fixtureServer.ts';

const PHOTOS = path.join(import.meta.dirname, '../fixtures/photos');
export const photo = (name: string) => fs.readFileSync(path.join(PHOTOS, name));

/** Distinct face images: the 2-face crew photo at several sizes (each size gives new crop bytes). */
export async function crewAt(width: number): Promise<Buffer> {
  return sharp(photo('gemini7-crew.jpg')).resize(width).jpeg({ quality: 90 }).toBuffer();
}

/** One-face JPEGs: the left and right halves of the crew photo. */
export async function singleFaces(): Promise<Buffer[]> {
  const src = photo('gemini7-crew.jpg');
  const { width = 0, height = 0 } = await sharp(src).metadata();
  const half = Math.floor(width / 2);
  return Promise.all([
    sharp(src).extract({ left: 0, top: 0, width: half, height }).jpeg().toBuffer(),
    sharp(src)
      .extract({ left: half, top: 0, width: width - half, height })
      .jpeg()
      .toBuffer(),
  ]);
}

export interface IngestTestApp {
  app: FastifyInstance;
  now: { value: number };
  dataDir: string;
  ingest(
    url: string,
    ip?: string,
  ): Promise<{ status: number; body: IngestResponse & { error?: string; message?: string } }>;
}

/**
 * App wired to fixture servers: every `*.test` host resolves to 127.0.0.1, the only address the
 * test IP policy allows besides public ones. 127.0.0.2 stays blocked, so it plays "internal".
 */
export async function ingestApp(deps: AppDeps = {}, dataDir?: string): Promise<IngestTestApp> {
  const now = { value: 1_700_000_000_000 };
  const config = testConfig(dataDir ? { dataDir } : {});
  const app = await createApp(config, {
    logger: false,
    clock: () => now.value,
    resolver: async (host) => {
      if (!host.endsWith('.test')) throw new Error(`ENOTFOUND ${host}`);
      return [{ address: '127.0.0.1', family: 4 }];
    },
    checkIp: (ip) => (ip === '127.0.0.1' ? { allowed: true } : checkAddress(ip)),
    ...deps,
  });
  return {
    app,
    now,
    dataDir: config.dataDir,
    ingest: async (url, ip = '198.51.100.20') => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingest',
        payload: { url },
        remoteAddress: ip,
      });
      return { status: res.statusCode, body: res.json() };
    },
  };
}

export function jpeg(bytes: Buffer) {
  return (_req: unknown, res: { setHeader(k: string, v: string): void; end(b: Buffer): void }) => {
    res.setHeader('content-type', 'image/jpeg');
    res.end(bytes);
  };
}

export const site = (f: FixtureServer, host: string, p = '/') => `http://${host}:${f.port}${p}`;
