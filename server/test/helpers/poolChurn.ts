import fs from 'node:fs';
import path from 'node:path';
import { FacePool } from '../../src/faces/pool.ts';

/**
 * Child-process script for crop.test.ts: closes pools and aborts jobs while workers still load
 * the model or run detection. A native abort in a worker would kill this process.
 */
const photo = fs.readFileSync(
  path.join(import.meta.dirname, '../fixtures/photos/gemini7-crew.jpg'),
);
const rounds = Number(process.argv[2] ?? 12);
for (let i = 0; i < rounds; i++) {
  const pool = new FacePool({ size: 2 });
  const ctl = new AbortController();
  // Every third round has no job: the workers are still loading the model at close.
  const jobs =
    i % 3 === 0 ? [] : [1, 2, 3].map(() => pool.process(photo, 20_000, ctl.signal).catch(() => {}));
  await new Promise((r) => setTimeout(r, (i * 37) % 400));
  if (i % 2) ctl.abort();
  await pool.close();
  await Promise.all(jobs);
}
console.log('ok');
