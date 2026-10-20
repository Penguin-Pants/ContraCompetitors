import { execFile } from 'node:child_process';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { MAX_CROP_PX } from '@lr/shared/render';
import {
  capSize,
  encodeCrop,
  ImageRejected,
  MAX_CROP_BYTES,
  processImage,
} from '../src/faces/crop.ts';
import { createYunetDetector, type Detector } from '../src/faces/detector.ts';
import { FacePool, MAX_QUEUED, PoolBusy, PoolRejected, PoolTimeout } from '../src/faces/pool.ts';

const PHOTOS = path.join(import.meta.dirname, 'fixtures/photos');
const photo = (name: string) => fs.readFileSync(path.join(PHOTOS, name));

let detector: Detector;
beforeAll(async () => {
  detector = await createYunetDetector();
});

describe('crop size cap', () => {
  test('MAX_CROP_PX is 512 for a 32 art px head at K_MAX 4 and DPR 2', () => {
    expect(MAX_CROP_PX).toBe(512);
    expect(MAX_CROP_BYTES).toBe(512 * 1024);
  });

  test('a 1,000 x 1,200 crop becomes 512 x 614 and passes the k=4, DPR 2 quality check', () => {
    const s = capSize(1000, 1200);
    expect(s).toEqual({ width: 512, height: 614 });
    expect(s.width).toBeGreaterThanOrEqual(32 * 2 * 4 * 2);
  });

  test('tall boxes are bounded by 2 x MAX_CROP_PX; small crops are never upscaled', () => {
    expect(capSize(400, 2000)).toEqual({ width: 205, height: 1024 });
    expect(capSize(80, 100)).toEqual({ width: 80, height: 100 });
  });

  test('a typical 512 px PNG face crop is accepted', async () => {
    const src = sharp(await sharp(photo('gemini7-crew.jpg')).resize(1024).toBuffer());
    const crop = await encodeCrop(src, { left: 300, top: 180, width: 512, height: 600 });
    expect(crop).not.toBeNull();
    expect(crop!.width).toBe(512);
    expect(crop!.png.length).toBeLessThanOrEqual(MAX_CROP_BYTES);
    const meta = await sharp(crop!.png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.exif).toBeUndefined();
  });
});

describe('processImage', () => {
  test('a photo with 2 faces gives 2 crops at the detector boxes', async () => {
    const crops = await processImage(photo('gemini7-crew.jpg'), detector);
    expect(crops).toHaveLength(2);
    for (const c of crops) {
      expect(c.width).toBeGreaterThanOrEqual(40);
      expect(c.width).toBeLessThan(150);
      expect(c.id).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(crops.map((c) => c.id)).size).toBe(2);
  });

  test('the minimum face width applies in source pixels: ~97 px faces in a 4000 px photo are kept', async () => {
    const crew = await sharp(photo('gemini7-crew.jpg')).resize(1000).toBuffer();
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: crew, left: 0, top: 0 }])
      .jpeg()
      .toBuffer();
    expect(await processImage(big, detector)).toHaveLength(2);
  });

  test('a landscape photo with no face gives 0', async () => {
    expect(await processImage(photo('launch-pad-aerial.jpg'), detector)).toEqual([]);
  });

  test('SVG, text and broken images are rejected', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(processImage(svg, detector)).rejects.toThrow(ImageRejected);
    await expect(processImage(Buffer.from('<html>hi</html>'), detector)).rejects.toThrow(
      ImageRejected,
    );
    await expect(
      processImage(photo('gemini7-crew.jpg').subarray(0, 2000), detector),
    ).rejects.toThrow(ImageRejected);
  });

  test('a GIF uses only its first frame; WebP and PNG decode', async () => {
    const base = sharp(photo('gemini7-crew.jpg'));
    for (const fmt of ['gif', 'webp', 'png'] as const) {
      const bytes = await base.clone().toFormat(fmt).toBuffer();
      expect((await processImage(bytes, detector)).length).toBe(2);
    }
  });
});

describe('FacePool', () => {
  let pool: FacePool;
  afterAll(async () => {
    await pool?.close();
  });

  test('runs jobs in worker processes', async () => {
    pool = new FacePool({ size: 2 });
    const crops = await pool.process(photo('gemini7-crew.jpg'), 20_000);
    expect(crops).toHaveLength(2);
    expect(Buffer.isBuffer(crops[0]!.png)).toBe(true);
    await expect(pool.process(Buffer.from('nope'), 20_000)).rejects.toThrow(PoolRejected);
    await pool.close();
  });

  test('a slow detector hits the deadline; the worker is replaced and the next job runs on a fresh worker', async () => {
    pool = new FacePool({ size: 1, testDetectDelayMs: 60_000 });
    const started = pool.started;
    const t0 = Date.now();
    await expect(pool.process(photo('gemini7-crew.jpg'), 1500)).rejects.toThrow(PoolTimeout);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(pool.started).toBe(started + 1);
    await pool.close();
  });
});

describe('FacePool limits', () => {
  test('a full queue rejects new jobs at once with PoolBusy, so memory stays bounded', async () => {
    const pool = new FacePool({ size: 1, testDetectDelayMs: 60_000 });
    const held = Array.from({ length: MAX_QUEUED + 1 }, () =>
      pool.process(photo('gemini7-crew.jpg'), 60_000).catch(() => {}),
    );
    await expect(pool.process(photo('gemini7-crew.jpg'), 60_000)).rejects.toThrow(PoolBusy);
    await pool.close();
    await Promise.all(held);
  });

  test('time in the queue counts toward the job deadline', async () => {
    const pool = new FacePool({ size: 1, testDetectDelayMs: 3000 });
    const first = pool.process(photo('gemini7-crew.jpg'), 10_000).catch(() => {});
    const t0 = Date.now();
    await expect(pool.process(photo('gemini7-crew.jpg'), 500)).rejects.toThrow(PoolTimeout);
    expect(Date.now() - t0).toBeLessThan(1500);
    await pool.close();
    await first;
  });
});

describe('FacePool listeners', () => {
  test('finished jobs leave no abort listener on the shared ingestion signal', async () => {
    const pool = new FacePool({ size: 2 });
    const ctl = new AbortController();
    const small = await sharp(photo('gemini7-crew.jpg')).resize(320).jpeg().toBuffer();
    for (let i = 0; i < 12; i++) await pool.process(small, 20_000, ctl.signal);
    // A listener left behind would keep each job, with its image bytes, until the signal aborts.
    expect(getEventListeners(ctl.signal, 'abort')).toHaveLength(0);
    await pool.close();
  }, 30_000);
});

describe('FacePool abort', () => {
  test('abort drops queued jobs and terminates the running one', async () => {
    const pool = new FacePool({ size: 1, testDetectDelayMs: 60_000 });
    const ctl = new AbortController();
    const started = pool.started;
    const jobs = [1, 2, 3].map(() => pool.process(photo('gemini7-crew.jpg'), 60_000, ctl.signal));
    await new Promise((r) => setTimeout(r, 300));
    ctl.abort();
    for (const j of jobs) await expect(j).rejects.toThrow(PoolTimeout);
    expect(pool.started).toBe(started + 1);
    await pool.close();
  });
});

describe('FacePool shutdown', () => {
  test('closing pools and aborting jobs while workers load the model or detect never aborts the process', async () => {
    const script = path.join(import.meta.dirname, 'helpers/poolChurn.ts');
    const result = await new Promise<{ code: number | null; signal: string | null; out: string }>(
      (resolve) => {
        const child = execFile(process.execPath, [script, '12'], { timeout: 120_000 }, (_e, out) =>
          resolve({ code: child.exitCode, signal: child.signalCode, out }),
        );
      },
    );
    expect(result).toEqual({ code: 0, signal: null, out: 'ok\n' });
  }, 130_000);
});
