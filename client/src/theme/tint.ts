import { clampChroma, formatHex, oklch } from 'culori';
import { CLOTHING_RAMP, HIGHLIGHT_RAMP } from '../assets/manifest.ts';
import { createImage, parseHex, type PixelImage } from '../render/pixelImage.ts';
import type { Theme } from './palette.ts';

/** Lightness offsets for the 4 ramp steps, dark to light. Step 2 is the brand color itself. */
const RAMP_OFFSETS = [-0.24, -0.12, 0, 0.1];

/** Four shades of a color, dark to light, matching the reserved ramp order. */
export function rampFor(hex: string): string[] {
  const c = oklch(hex);
  if (!c) throw new Error(`Bad color ${hex}`);
  return RAMP_OFFSETS.map((d) =>
    d === 0
      ? hex.toLowerCase()
      : formatHex(clampChroma({ ...c, l: Math.max(0, Math.min(1, c.l + d)) }, 'oklch'))!,
  );
}

function key(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Recolors reserved ramps (THM-1, THM-2): clothing ramp to the secondary ramp, highlight ramp to
 * the primary ramp. Every other pixel is unchanged.
 */
export function tintImage(img: PixelImage, theme: Theme): PixelImage {
  const map = new Map<number, [number, number, number]>();
  const add = (from: readonly string[], to: readonly string[]) =>
    from.forEach((c, i) => {
      const [r, g, b] = parseHex(c);
      map.set(key(r, g, b), parseHex(to[i]!));
    });
  add(CLOTHING_RAMP, rampFor(theme.secondary));
  add(HIGHLIGHT_RAMP, rampFor(theme.primary));
  const out = createImage(img.w, img.h);
  out.data.set(img.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const to = map.get(key(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!));
    if (to) out.data.set(to, i);
  }
  return out;
}
