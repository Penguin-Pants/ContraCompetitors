import { HEAD_W_ART, PIXEL_SCALE } from '@lr/shared/render';

/** Fewer faces than this prompts for uploads (ING-7). Matches the server headless trigger. */
export const MIN_FACES = 5;

export type FaceStyleSetting = 'auto' | 'smooth' | 'pixelated';
export type FaceStyle = 'smooth' | 'pixelated';

export const FACE_STYLE_SETTINGS: readonly FaceStyleSetting[] = ['auto', 'smooth', 'pixelated'];

/** Width of an on-screen head in device pixels for the current scale and capped DPR. */
export function headWidthDevicePx(k: number, dpr: number): number {
  return HEAD_W_ART * PIXEL_SCALE * k * dpr;
}

/** D-5: a face passes when its cropped source width is at least its on-screen width. */
export function facePasses(srcWidth: number, onScreenWidth: number): boolean {
  return srcWidth >= onScreenWidth;
}

/**
 * THM-6, THM-7, E-9: the style for every face in a run, uploads included. An override wins.
 * Auto: Smooth only when more than half of the faces pass.
 */
export function chooseFaceStyle(
  srcWidths: readonly number[],
  onScreenWidth: number,
  setting: FaceStyleSetting,
): FaceStyle {
  if (setting !== 'auto') return setting;
  const passing = srcWidths.filter((w) => facePasses(w, onScreenWidth)).length;
  return passing * 2 > srcWidths.length ? 'smooth' : 'pixelated';
}
