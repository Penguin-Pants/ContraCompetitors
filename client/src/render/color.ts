import { parseHex, toHex } from './pixelImage.ts';

/** Multiplies RGB by f (f < 1 darkens, f > 1 lightens), clamped. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = parseHex(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return toHex(c(r), c(g), c(b));
}
