import { expect, test } from 'vitest';
import { CANDIDATES_PER_PRIORITY, CandidateSet } from '../src/ingest/images.ts';

test('a flood of low-priority images cannot push out team or author images, and the set stays bounded', () => {
  const set = new CandidateSet();
  for (let i = 0; i < 10_000; i++) set.add({ url: `/other/${i}.jpg`, priority: 0 });
  set.add({ url: '/team/a.jpg', priority: 1 });
  set.add({ url: '/blog/author.jpg', priority: 2 });
  expect(set.size).toBe(CANDIDATES_PER_PRIORITY + 2);
  const urls = set.list().map((c) => c.url);
  expect(urls).toContain('/team/a.jpg');
  expect(urls).toContain('/blog/author.jpg');
});

test('a repeated URL is kept once with its highest priority', () => {
  const set = new CandidateSet();
  set.add({ url: '/a.jpg', priority: 0 });
  set.add({ url: '/a.jpg', priority: 1 });
  set.add({ url: '/a.jpg', priority: 0 });
  expect(set.list()).toEqual([{ url: '/a.jpg', priority: 1 }]);
});
