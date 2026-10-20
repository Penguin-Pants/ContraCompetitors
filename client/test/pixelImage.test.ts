import { describe, expect, test } from 'vitest';
import { fromRows, getPixel, scaleInt, type PixelImage } from '../src/render/pixelImage.ts';
import { rotatePixels } from '../src/render/rotate.ts';

const PAL = { r: '#ff0000', g: '#00ff00', b: '#0000ff' };

function colors(img: PixelImage): Set<string> {
  const set = new Set<string>();
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const p = getPixel(img, x, y);
      if (p[3] > 0) set.add(p.join(','));
    }
  return set;
}

describe('fromRows', () => {
  test('maps palette chars and leaves dots transparent', () => {
    const img = fromRows(['r.', '.g'], PAL);
    expect(getPixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, 1, 0)[3]).toBe(0);
    expect(getPixel(img, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  test('throws on an unknown char', () => {
    expect(() => fromRows(['x'], PAL)).toThrow();
  });
});

describe('scaleInt', () => {
  test('each source pixel becomes an n x n block', () => {
    const img = scaleInt(fromRows(['rg'], PAL), 3);
    expect(img.w).toBe(6);
    expect(img.h).toBe(3);
    expect(getPixel(img, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, 3, 0)).toEqual([0, 255, 0, 255]);
  });

  test('rejects non-integer factors', () => {
    expect(() => scaleInt(fromRows(['r'], PAL), 1.5)).toThrow();
  });
});

describe('rotatePixels', () => {
  const src = fromRows(['rrrrgggg', 'rrrrgggg', 'bbbbbbbb', 'bbbbbbbb'], PAL);

  test('0 degrees returns the same pixels', () => {
    const out = rotatePixels(src, 0);
    expect(out.w).toBe(8);
    expect(out.h).toBe(4);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  test('90 degrees swaps width and height', () => {
    const out = rotatePixels(src, Math.PI / 2);
    expect([out.w, out.h]).toEqual([4, 8]);
  });

  test('30 degrees only uses source colors and full alpha (no blending)', () => {
    const out = rotatePixels(src, Math.PI / 6);
    expect(out.w).toBeGreaterThan(8);
    for (let i = 3; i < out.data.length; i += 4) expect([0, 255]).toContain(out.data[i]);
    for (const c of colors(out)) expect(colors(src)).toContain(c);
  });
});
