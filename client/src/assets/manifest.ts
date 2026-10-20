import { getPixel, parseHex, type PixelImage } from '../render/pixelImage.ts';

/**
 * Sprite contract shared by code-drawn placeholder art and the committed Sprite Fusion art (Phase 10).
 *
 * - Enemy bodies are headless. Every enemy frame has one head anchor.
 * - Enemy clothing uses only CLOTHING_RAMP colors. Tinting maps it to the secondary color.
 * - Player highlights use only HIGHLIGHT_RAMP colors. Tinting maps them to the primary color.
 * - Sheets are one row of frames, each frameW x frameH art pixels.
 */
export const CLOTHING_RAMP = ['#3c3c3c', '#5c5c5c', '#7c7c7c', '#9c9c9c'] as const;
export const HIGHLIGHT_RAMP = ['#4a1f4a', '#7a2f7a', '#aa3faa', '#da4fda'] as const;

/** Neck point: the center bottom of the head, in frame-local art pixels. */
export interface HeadAnchor {
  x: number;
  y: number;
}

export interface FrameSpec {
  head?: HeadAnchor;
}

export interface AnimationSpec {
  frames: readonly number[];
  fps: number;
  loop: boolean;
}

export type SheetKind = 'player' | 'enemy' | 'prop';

export type SheetSource =
  { type: 'png'; path: string } | { type: 'code'; draw: () => PixelImage[] };

export interface SheetSpec {
  id: string;
  kind: SheetKind;
  frameW: number;
  frameH: number;
  source: SheetSource;
  frames: readonly FrameSpec[];
  animations: Readonly<Record<string, AnimationSpec>>;
}

function rampHas(ramp: readonly string[], img: PixelImage): boolean {
  const keys = new Set(ramp.map((c) => parseHex(c).join(',')));
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const p = getPixel(img, x, y);
      if (p[3] > 0 && keys.has(`${p[0]},${p[1]},${p[2]}`)) return true;
    }
  return false;
}

/** Returns contract violations for one sheet and its decoded frames. Empty means valid. */
export function validateSheet(spec: SheetSpec, frames: readonly PixelImage[]): string[] {
  const errors: string[] = [];
  if (frames.length !== spec.frames.length) {
    errors.push(`${spec.id}: ${frames.length} frames decoded, ${spec.frames.length} declared`);
  }
  frames.forEach((img, i) => {
    if (img.w !== spec.frameW || img.h !== spec.frameH) {
      errors.push(
        `${spec.id}[${i}]: size ${img.w}x${img.h}, expected ${spec.frameW}x${spec.frameH}`,
      );
    }
  });
  spec.frames.forEach((f, i) => {
    if (spec.kind === 'enemy' && !f.head) errors.push(`${spec.id}[${i}]: missing head anchor`);
    if (
      f.head &&
      (f.head.x < 0 || f.head.y < 0 || f.head.x > spec.frameW || f.head.y > spec.frameH)
    ) {
      errors.push(`${spec.id}[${i}]: head anchor outside frame`);
    }
  });
  for (const [name, anim] of Object.entries(spec.animations)) {
    if (anim.frames.length === 0) errors.push(`${spec.id}.${name}: no frames`);
    for (const f of anim.frames) {
      if (!Number.isInteger(f) || f < 0 || f >= spec.frames.length) {
        errors.push(`${spec.id}.${name}: frame ${f} out of range`);
      }
    }
  }
  if (spec.kind === 'enemy' && !frames.some((img) => rampHas(CLOTHING_RAMP, img))) {
    errors.push(`${spec.id}: no clothing-ramp pixels`);
  }
  if (spec.kind === 'player' && !frames.some((img) => rampHas(HIGHLIGHT_RAMP, img))) {
    errors.push(`${spec.id}: no highlight-ramp pixels`);
  }
  return errors;
}

/** Frame index for an animation at a time in ms. */
export function animationFrame(anim: AnimationSpec, timeMs: number): number {
  const step = Math.floor((timeMs / 1000) * anim.fps);
  const i = anim.loop ? step % anim.frames.length : Math.min(step, anim.frames.length - 1);
  return anim.frames[i]!;
}
