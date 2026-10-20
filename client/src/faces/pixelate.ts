import { HEAD_W_ART, PIXEL_SCALE } from '@lr/shared/render';

/** Pixelated head size in L1 pixels: one L1 pixel is half an art pixel (THM-5). */
export const PIXEL_HEAD = HEAD_W_ART * PIXEL_SCALE;

/** Center-crops a source to a square and returns the crop rect (cover fit). */
export function coverSquare(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return { sx: (w - size) / 2, sy: (h - size) / 2, size };
}

/** True for pixels inside the head ellipse of an n x n grid. Hard edge, so pixels stay crisp. */
export function inHead(x: number, y: number, n: number): boolean {
  const c = n / 2;
  return ((x + 0.5 - c) / (c - 0.5)) ** 2 + ((y + 0.5 - c) / (c - 0.25)) ** 2 <= 1;
}

/**
 * Downsamples a face to PIXEL_HEAD x PIXEL_HEAD with a hard ellipse mask. The result is drawn 1:1
 * on L1 with `PixelCanvas.fine`, so it sits on the half-art-pixel grid.
 */
export function pixelateFace(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const n = PIXEL_HEAD;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  const { sx, sy, size } = coverSquare(w, h);
  ctx.drawImage(src, sx, sy, size, size, 0, 0, n, n);
  const img = ctx.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) img.data[(y * n + x) * 4 + 3] = inHead(x, y, n) ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A few representative colors of a pixelated face, for pop confetti. */
export function sampleColors(face: HTMLCanvasElement, count = 6): string[] {
  const ctx = face.getContext('2d', { willReadFrequently: true })!;
  const n = face.width;
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.floor(n / 2 + Math.cos(a) * n * 0.25);
    const y = Math.floor(n / 2 + Math.sin(a) * n * 0.25);
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    colors.push(`rgb(${r} ${g} ${b})`);
  }
  return colors;
}
