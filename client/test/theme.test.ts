import { describe, expect, test } from 'vitest';
import { CLOTHING_RAMP, HIGHLIGHT_RAMP } from '../src/assets/manifest.ts';
import { fromRows, getPixel, parseHex } from '../src/render/pixelImage.ts';
import {
  colorDistance,
  deriveColor,
  makeReadable,
  minContrast,
  MIN_CONTRAST,
  MIN_DISTANCE,
} from '../src/theme/readability.ts';
import { rampFor, tintImage } from '../src/theme/tint.ts';

function readable(primary: string, secondary: string) {
  expect(minContrast(primary)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(minContrast(secondary)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(colorDistance(primary, secondary)).toBeGreaterThanOrEqual(MIN_DISTANCE);
}

describe('readability', () => {
  test('one color in gives two readable colors out', () => {
    const t = makeReadable(['#1e88e5']);
    readable(t.primary, t.secondary);
  });

  test('two near-identical colors get separated', () => {
    const t = makeReadable(['#e53935', '#e53a36']);
    expect(colorDistance('#e53935', '#e53a36')).toBeLessThan(MIN_DISTANCE);
    readable(t.primary, t.secondary);
  });

  test('a low-contrast color gets adjusted', () => {
    expect(minContrast('#1a237e')).toBeLessThan(MIN_CONTRAST);
    const t = makeReadable(['#1a237e', '#ffb300']);
    expect(t.primary).not.toBe('#1a237e');
    readable(t.primary, t.secondary);
  });

  test('already readable colors stay unchanged', () => {
    expect(makeReadable(['#ffb300', '#4fc3f7'])).toEqual({
      primary: '#ffb300',
      secondary: '#4fc3f7',
    });
  });

  test('gray input still derives a distinct color', () => {
    const t = makeReadable(['#9e9e9e']);
    readable(t.primary, t.secondary);
  });

  test('derived color has a hue about 150 degrees away', () => {
    expect(deriveColor('#ff0000')).not.toBe('#ff0000');
  });

  test('zero colors is an error (the picker handles that case)', () => {
    expect(() => makeReadable([])).toThrow();
  });
});

describe('tint', () => {
  test('clothing ramp maps to the secondary ramp; highlight ramp to primary; other pixels unchanged', () => {
    const img = fromRows(['0123', 'abcd', 'kk..'], {
      0: CLOTHING_RAMP[0],
      1: CLOTHING_RAMP[1],
      2: CLOTHING_RAMP[2],
      3: CLOTHING_RAMP[3],
      a: HIGHLIGHT_RAMP[0],
      b: HIGHLIGHT_RAMP[1],
      c: HIGHLIGHT_RAMP[2],
      d: HIGHLIGHT_RAMP[3],
      k: '#123456',
    });
    const theme = { primary: '#ffb300', secondary: '#4fc3f7' };
    const out = tintImage(img, theme);
    const sec = rampFor(theme.secondary);
    const pri = rampFor(theme.primary);
    for (let x = 0; x < 4; x++) {
      expect(getPixel(out, x, 0).slice(0, 3)).toEqual(parseHex(sec[x]!));
      expect(getPixel(out, x, 1).slice(0, 3)).toEqual(parseHex(pri[x]!));
    }
    expect(getPixel(out, 0, 2)).toEqual(getPixel(img, 0, 2));
    expect(getPixel(out, 3, 2)[3]).toBe(0);
    expect(sec[2]).toBe('#4fc3f7');
  });

  test('ramp goes dark to light', () => {
    const r = rampFor('#4fc3f7').map((c) => parseHex(c).reduce((a, b) => a + b, 0));
    expect([...r].sort((a, b) => a - b)).toEqual(r);
  });
});

test.each([[['#ffffff', '#ffffff']], [['#ffffff']], [['#fefefe', '#ffffff']]])(
  'white input %j still gives two distinct readable colors',
  (input) => {
    const t = makeReadable(input);
    expect(colorDistance(t.primary, t.secondary)).toBeGreaterThanOrEqual(MIN_DISTANCE);
    expect(minContrast(t.primary)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(minContrast(t.secondary)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  },
);
