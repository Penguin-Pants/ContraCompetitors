import { expect, test } from 'vitest';
import { computeScale } from '../src/render/scale.ts';

test.each([
  [959, 540, 1, true],
  [960, 540, 1, false],
  [960, 539, 1, false],
  [1920, 1080, 2, false],
  [1919, 1080, 1, false],
  [3840, 2160, 4, false],
  [7680, 4320, 4, false],
])('viewport %i x %i gives k=%i narrow=%s', (w, h, k, narrow) => {
  expect(computeScale(w, h)).toEqual({ k, narrow });
});
