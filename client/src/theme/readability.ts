import {
  clampChroma,
  differenceEuclidean,
  formatHex,
  oklch,
  wcagContrast,
  type Oklch,
} from 'culori';
import { ZONE_BACKDROPS } from '../level/zones.ts';
import type { Theme } from './palette.ts';

export const MIN_CONTRAST = 3;
/** Minimum OKLab distance between primary and secondary. */
export const MIN_DISTANCE = 0.12;
/** Hue offset used to derive a missing color. */
export const DERIVE_HUE_OFFSET = 150;
const MIN_DERIVED_CHROMA = 0.1;

const okDistance = differenceEuclidean('oklab');

function toOklch(hex: string): Oklch {
  const c = oklch(hex);
  if (!c) throw new Error(`Bad color ${hex}`);
  return { ...c, h: c.h ?? 0 };
}

function toHex(c: Oklch): string {
  return formatHex(clampChroma(c, 'oklch'))!;
}

export function minContrast(hex: string, backdrops: readonly string[] = ZONE_BACKDROPS): number {
  return Math.min(...backdrops.map((b) => wcagContrast(hex, b)));
}

/** Raises lightness until the color reaches MIN_CONTRAST on every backdrop. Readable input is returned unchanged. */
export function ensureContrast(hex: string, backdrops: readonly string[] = ZONE_BACKDROPS): string {
  if (minContrast(hex, backdrops) >= MIN_CONTRAST) return hex.toLowerCase();
  const c = toOklch(hex);
  for (let l = c.l; l <= 1.0001; l += 0.01) {
    const out = toHex({ ...c, l: Math.min(1, l) });
    if (minContrast(out, backdrops) >= MIN_CONTRAST) return out;
  }
  return '#ffffff';
}

/** A second color from the first: hue + 150 degrees, same lightness, at least some chroma. */
export function deriveColor(hex: string): string {
  const c = toOklch(hex);
  return toHex({
    ...c,
    h: ((c.h ?? 0) + DERIVE_HUE_OFFSET) % 360,
    c: Math.max(c.c, MIN_DERIVED_CHROMA),
  });
}

export function colorDistance(a: string, b: string): number {
  return okDistance(a, b);
}

/** Moves `secondary` away from `primary` until they differ by MIN_DISTANCE and stay readable. */
function separate(primary: string, secondary: string, backdrops: readonly string[]): string {
  if (colorDistance(primary, secondary) >= MIN_DISTANCE) return secondary;
  const s = toOklch(secondary);
  const chroma = Math.max(s.c, MIN_DERIVED_CHROMA);
  for (let step = 1; step <= 9; step++) {
    for (const dir of [1, -1]) {
      const cand = ensureContrast(
        toHex({ ...s, c: chroma, h: (s.h! + dir * step * 20 + 360) % 360 }),
        backdrops,
      );
      if (colorDistance(primary, cand) >= MIN_DISTANCE) return cand;
    }
  }
  for (let dl = 0.05; dl <= 0.6; dl += 0.05) {
    const cand = ensureContrast(toHex({ ...s, l: Math.min(1, s.l + dl) }), backdrops);
    if (colorDistance(primary, cand) >= MIN_DISTANCE) return cand;
  }
  return '#ffffff';
}

/**
 * THM-8, E-6: turns 1 or 2 found colors into a readable theme. The missing color is derived.
 * Each color gets at least 3:1 contrast on every fixed zone backdrop, and the two colors differ by
 * MIN_DISTANCE in OKLab. Colors that already pass come back unchanged.
 */
export function makeReadable(
  colors: readonly string[],
  backdrops: readonly string[] = ZONE_BACKDROPS,
): Theme {
  if (colors.length === 0) throw new Error('makeReadable needs at least one color');
  const primary = ensureContrast(colors[0]!, backdrops);
  const secondary = ensureContrast(colors[1] ?? deriveColor(primary), backdrops);
  return { primary, secondary: separate(primary, secondary, backdrops) };
}
