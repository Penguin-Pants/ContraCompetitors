import { expect, test } from 'vitest';
import { normalizeUrl } from '../src/ui/mainMenu.ts';

test.each([
  ['example.com', 'https://example.com'],
  ['  example.com/team ', 'https://example.com/team'],
  ['example.com:8443', 'https://example.com:8443'],
  ['localhost:3000/about', 'https://localhost:3000/about'],
  ['http://example.com', 'http://example.com'],
  ['HTTPS://example.com:8443', 'HTTPS://example.com:8443'],
  ['ftp://example.com', 'ftp://example.com'],
])('normalizeUrl(%j) is %j', (raw, out) => {
  expect(normalizeUrl(raw)).toBe(out);
});
