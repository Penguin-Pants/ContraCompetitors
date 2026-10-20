import { describe, expect, test } from 'vitest';
import { assignFaces } from '../src/faces/assign.ts';
import { chooseFaceStyle, headWidthDevicePx } from '../src/faces/quality.ts';

describe('assign', () => {
  test('3 faces, 7 enemies: every enemy has a face, each face used 2 or 3 times', () => {
    const out = assignFaces(['a', 'b', 'c'], 7);
    expect(out.every((f) => f !== null)).toBe(true);
    const counts = ['a', 'b', 'c'].map((f) => out.filter((x) => x === f).length);
    for (const n of counts) expect([2, 3]).toContain(n);
  });

  test('no face repeats when there are at least as many faces as enemies', () => {
    const faces = Array.from({ length: 10 }, (_, i) => i);
    const out = assignFaces(faces, 10);
    expect(new Set(out).size).toBe(10);
  });

  test('0 faces gives placeholders', () => {
    expect(assignFaces([], 4)).toEqual([null, null, null, null]);
  });
});

describe('quality', () => {
  const need = 100;
  test('3 of 5 pass gives Smooth', () => {
    expect(chooseFaceStyle([120, 100, 300, 50, 20], need, 'auto')).toBe('smooth');
  });

  test('2 of 4 pass gives Pixelated (exactly half is not most)', () => {
    expect(chooseFaceStyle([120, 100, 50, 20], need, 'auto')).toBe('pixelated');
  });

  test('override wins', () => {
    expect(chooseFaceStyle([10, 10, 10], need, 'smooth')).toBe('smooth');
    expect(chooseFaceStyle([500, 500, 500], need, 'pixelated')).toBe('pixelated');
  });

  test('uploaded faces count: two site faces fail, three uploads pass', () => {
    const site = [40, 40];
    const uploads = [512, 512, 512];
    expect(chooseFaceStyle([...site, ...uploads], need, 'auto')).toBe('smooth');
    expect(chooseFaceStyle(site, need, 'auto')).toBe('pixelated');
  });

  test('on-screen head width uses k and capped DPR in device pixels', () => {
    expect(headWidthDevicePx(1, 1)).toBe(64);
    expect(headWidthDevicePx(4, 2)).toBe(512);
  });
});
