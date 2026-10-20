import { expect, test } from 'vitest';
import { DIFFICULTIES, isDifficulty } from '../src/difficulty.ts';

test.each(DIFFICULTIES)('%s is a difficulty', (d) => {
  expect(isDifficulty(d)).toBe(true);
});

test.each([['Easy'], [' easy'], [''], ['expert'], [1], [null], [undefined], [['easy']]])(
  '%j is not a difficulty',
  (v) => {
    expect(isDifficulty(v)).toBe(false);
  },
);
