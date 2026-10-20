import { createImage, type PixelImage } from '../render/pixelImage.ts';
import { toSurface, type Surface } from '../render/surface.ts';
import type { SheetSpec } from './manifest.ts';

export interface LoadedSheet {
  spec: SheetSpec;
  /** Untinted frames. Tinting (Phase 5) reads these. */
  images: PixelImage[];
  surfaces: Surface[];
}

async function decodePng(path: string): Promise<PixelImage> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Sprite ${path}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return { w: bitmap.width, h: bitmap.height, data };
}

/** Cuts a one-row sheet into frames. */
export function sliceFrames(sheet: PixelImage, frameW: number, frameH: number): PixelImage[] {
  const count = Math.floor(sheet.w / frameW);
  const frames: PixelImage[] = [];
  for (let i = 0; i < count; i++) {
    const img = createImage(frameW, frameH);
    for (let y = 0; y < frameH; y++) {
      const si = (y * sheet.w + i * frameW) * 4;
      img.data.set(sheet.data.subarray(si, si + frameW * 4), y * frameW * 4);
    }
    frames.push(img);
  }
  return frames;
}

export async function loadFrames(spec: SheetSpec): Promise<PixelImage[]> {
  if (spec.source.type === 'code') return spec.source.draw();
  return sliceFrames(await decodePng(spec.source.path), spec.frameW, spec.frameH);
}

export async function loadSheet(spec: SheetSpec): Promise<LoadedSheet> {
  const images = await loadFrames(spec);
  return { spec, images, surfaces: images.map(toSurface) };
}
