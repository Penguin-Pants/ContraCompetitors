import type { PixelImage } from './pixelImage.ts';

/** A drawable sprite at art resolution. */
export interface Surface {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}

export function toSurface(img: PixelImage): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = img.w;
  canvas.height = img.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  return { w: img.w, h: img.h, canvas };
}
