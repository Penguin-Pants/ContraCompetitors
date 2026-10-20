import { describe, expect, test } from 'vitest';
import { canonicalHost, matchesDomain } from '../src/net/hostname.ts';

describe('canonicalHost', () => {
  test.each([
    ['EXAMPLE.com', 'example.com'],
    ['example.com.', 'example.com'],
    ['www.example.com..', 'www.example.com'],
    ['bücher.example', 'xn--bcher-kva.example'],
    ['BÜCHER.example', 'xn--bcher-kva.example'],
    ['xn--bcher-kva.example', 'xn--bcher-kva.example'],
    ['[::1]', '::1'],
    ['2001:DB8::0001', '2001:db8::1'],
    ['127.0.0.1', '127.0.0.1'],
  ])('%s -> %s', (input, out) => {
    expect(canonicalHost(input)).toBe(out);
  });

  test.each(['', '.', 'a..b', '..example.com', 'exa mple.com', 'a/b', 'user@host'])(
    '%j is rejected',
    (input) => {
      expect(canonicalHost(input)).toBeNull();
    },
  );
});

test('matchesDomain: equal or dot-suffix only', () => {
  expect(matchesDomain('example.com', 'example.com')).toBe(true);
  expect(matchesDomain('www.example.com', 'example.com')).toBe(true);
  expect(matchesDomain('notexample.com', 'example.com')).toBe(false);
});
