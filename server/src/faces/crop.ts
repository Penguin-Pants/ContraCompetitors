import { createHash } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo, type Sharp } from 'sharp';
import { MAX_CROP_PX } from '@lr/shared/render';
import type { Detector, FaceBox } from './detector.ts';

/** Largest decoded image (SEC-3). */
export const LIMIT_INPUT_PIXELS = 25_000_000;
export const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif']);
/** Longest side of the image given to the detector. */
export const DETECT_MAX_SIDE = 640;
/** Largest encoded crop in bytes. */
export const MAX_CROP_BYTES = 2 * MAX_CROP_PX * MAX_CROP_PX;

export interface FaceCrop {
  /** SHA-256 of the PNG bytes. */
  id: string;
  png: Buffer;
  width: number;
  height: number;
}

export class ImageRejected extends Error {}

/**
 * Downscale target that keeps the aspect ratio: width at most MAX_CROP_PX, height at most
 * 2 x MAX_CROP_PX. Never upscales.
 */
export function capSize(w: number, h: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_CROP_PX / w, (2 * MAX_CROP_PX) / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Integer pixel region for a box, clamped to the image. */
export function cropRegion(box: FaceBox, imgW: number, imgH: number) {
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(imgW, Math.ceil(box.x + box.w));
  const bottom = Math.min(imgH, Math.ceil(box.y + box.h));
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Encodes a crop as PNG with no metadata. Returns null when it is over MAX_CROP_BYTES. */
export async function encodeCrop(
  img: Sharp,
  region: ReturnType<typeof cropRegion>,
): Promise<FaceCrop | null> {
  const size = capSize(region.width, region.height);
  const png = await img
    .extract(region)
    .resize(size.width, size.height, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  if (png.length > MAX_CROP_BYTES) return null;
  return {
    id: createHash('sha256').update(png).digest('hex'),
    png,
    width: size.width,
    height: size.height,
  };
}

/**
 * ING-5, SEC-3, E-7: decodes an image (JPEG, PNG, WebP or GIF first frame only), detects faces
 * and crops each image to the detected face box only. Throws ImageRejected for anything else.
 */
export async function processImage(bytes: Uint8Array, detector: Detector): Promise<FaceCrop[]> {
  const open = () =>
    sharp(bytes, { limitInputPixels: LIMIT_INPUT_PIXELS, pages: 1, failOn: 'error' }).autoOrient();
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: LIMIT_INPUT_PIXELS, pages: 1 }).metadata();
  } catch (err) {
    throw new ImageRejected(`decode failed: ${(err as Error).message}`);
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format))
    throw new ImageRejected(`format ${meta.format}`);
  let small: { data: Buffer; info: OutputInfo };
  let full: { width: number; height: number };
  try {
    const oriented = await open().toBuffer({ resolveWithObject: true });
    full = { width: oriented.info.width, height: oriented.info.height };
    small = await sharp(oriented.data)
      .resize(DETECT_MAX_SIDE, DETECT_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const boxes = await detector.detect({
      data: small.data,
      width: small.info.width,
      height: small.info.height,
    });
    const scale = full.width / small.info.width;
    const crops: FaceCrop[] = [];
    for (const b of boxes) {
      const region = cropRegion(
        { ...b, x: b.x * scale, y: b.y * scale, w: b.w * scale, h: b.h * scale },
        full.width,
        full.height,
      );
      if (region.width < 1 || region.height < 1) continue;
      const crop = await encodeCrop(sharp(oriented.data), region);
      if (crop) crops.push(crop);
    }
    return crops;
  } catch (err) {
    if (err instanceof ImageRejected) throw err;
    throw new ImageRejected(`decode failed: ${(err as Error).message}`);
  }
}
