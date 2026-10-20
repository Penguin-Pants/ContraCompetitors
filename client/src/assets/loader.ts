import { createImage, type PixelImage } from '../render/pixelImage.ts';
import { toSurface, type Surface } from '../render/surface.ts';
import { validateSheet, type SheetSpec } from './manifest.ts';

export interface LoadedSheet {
  spec: SheetSpec;
  /** Untinted frames. Tinting (Phase 5) reads these. */
  images: PixelImage[];
  surfaces: Surface[];
  /** Per frame: rows above the frame's lowest opaque pixel, plus 1. Draw at bodyBottom - feet. */
  feet: number[];
}

/** Row below the lowest opaque pixel, so a sprite's feet (not its padding) stand on the ground. */
export function feetRow(img: PixelImage): number {
  for (let y = img.h - 1; y >= 0; y--)
    for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3]! > 0) return y + 1;
  return img.h;
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

/** Loads a sheet and enforces the sprite contract: a sheet that breaks it never reaches play. */
export async function loadSheet(spec: SheetSpec): Promise<LoadedSheet> {
  const images = await loadFrames(spec);
  const errors = validateSheet(spec, images);
  if (errors.length) throw new Error(`Sprite contract: ${errors.join('; ')}`);
  return { spec, images, surfaces: images.map(toSurface), feet: images.map(feetRow) };
}
