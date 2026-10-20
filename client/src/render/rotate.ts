import { createImage, type PixelImage } from './pixelImage.ts';

/**
 * Rotates around the image center at art resolution with nearest-neighbor sampling (RND-3).
 * The output grows to the rotated bounding box. Every output pixel is a copy of one source
 * pixel, so the result stays on the art grid when it is blitted at 2x.
 */
export function rotatePixels(img: PixelImage, angleRad: number): PixelImage {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const w = Math.ceil(Math.abs(img.w * cos) + Math.abs(img.h * sin) - 1e-9);
  const h = Math.ceil(Math.abs(img.w * sin) + Math.abs(img.h * cos) - 1e-9);
  const out = createImage(w, h);
  const scx = img.w / 2;
  const scy = img.h / 2;
  const dcx = w / 2;
  const dcy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - dcx;
      const dy = y + 0.5 - dcy;
      const sx = Math.floor(cos * dx + sin * dy + scx);
      const sy = Math.floor(-sin * dx + cos * dy + scy);
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const si = (sy * img.w + sx) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return out;
}
