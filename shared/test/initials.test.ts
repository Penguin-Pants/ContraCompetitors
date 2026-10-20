import { expect, test } from 'vitest';
import { normalizeInitials } from '../src/initials.ts';

test.each([
  ['abc', 'ABC'],
  ['JmD', 'JMD'],
  ['AB', null],
  ['ABCD', null],
  ['A1C', null],
  [' AB', null],
  ['ÄBC', null],
])('%j normalizes to %j', (input, out) => {
  expect(normalizeInitials(input)).toBe(out);
});
