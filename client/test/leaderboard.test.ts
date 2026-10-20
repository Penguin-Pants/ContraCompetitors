import { expect, test } from 'vitest';
import { qualifies } from '../src/ui/leaderboard.ts';

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    initials: 'AAA',
    timeMs: (i + 1) * 1000,
    createdAt: i,
  }));

test('fewer than 10 rows always qualifies', () => {
  expect(qualifies(rows(9), 999_999)).toBe(true);
  expect(qualifies([], 1)).toBe(true);
});

test('with 10 rows only a time below the 10th qualifies', () => {
  expect(qualifies(rows(10), 9999)).toBe(true);
  expect(qualifies(rows(10), 10_000)).toBe(false);
  expect(qualifies(rows(10), 10_001)).toBe(false);
});
