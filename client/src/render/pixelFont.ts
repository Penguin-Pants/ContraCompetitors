import type { PixelCanvas } from './pixelCanvas.ts';

/** 3 x 5 pixel font for level signs. Each glyph is 5 rows of 3 bits. */
const GLYPHS: Record<string, readonly number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  ' ': [0, 0, 0, 0, 0],
};

const GLYPH_W = 3;

export function textWidth(text: string): number {
  return text.length * (GLYPH_W + 1) - 1;
}

/** Draws upper-case text at art pixel (x, y). */
export function drawText(p: PixelCanvas, text: string, x: number, y: number, color: string) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const rows = GLYPHS[ch] ?? GLYPHS[' ']!;
    rows.forEach((bits, ry) => {
      for (let rx = 0; rx < GLYPH_W; rx++)
        if (bits & (4 >> rx)) p.rect(cx + rx, y + ry, 1, 1, color);
    });
    cx += GLYPH_W + 1;
  }
}
