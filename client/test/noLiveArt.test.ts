import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');

function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .flatMap((d) => (d.isFile() ? [path.join(d.parentPath, d.name)] : []));
}

test('RND-7: no runtime code refers to spritefusion.com', () => {
  const hits = ['client/src', 'server/src', 'shared/src']
    .flatMap((d) => files(path.join(ROOT, d)))
    .filter((f) => /spritefusion\.com/i.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  expect(hits).toEqual([]);
});
