import { HEAD_W_ART } from '@lr/shared/render';
import { createImage, parseHex, setPixel, type PixelImage } from '../render/pixelImage.ts';
import { shade } from '../render/color.ts';

const SKIN = ['#f1c7a1', '#d9a27a', '#b07850', '#7d5236', '#5a3a26'];
const HAIR = ['#2a1d14', '#5b3a1f', '#b88b4a', '#1a1a1a', '#8a8a8a'];

/**
 * Code-drawn pixel heads, HEAD_W_ART square. Used until faces load and whenever a run has zero
 * faces (E-8).
 */
export function placeholderHead(variant: number): PixelImage {
  const n = HEAD_W_ART;
  const img = createImage(n, n);
  const skin = parseHex(SKIN[variant % SKIN.length]!);
  const skinDark = parseHex(shade(SKIN[variant % SKIN.length]!, 0.8));
  const hair = parseHex(HAIR[Math.floor(variant / SKIN.length) % HAIR.length]!);
  const outline = parseHex('#0d1018');
  const eye = parseHex('#101010');
  const mouth = parseHex('#7a2a2a');
  const cx = n / 2 - 0.5;
  const cy = n / 2;
  const rx = n / 2 - 2;
  const ry = n / 2 - 1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      const edge = d > 0.82;
      const hairZone = y < n * 0.32 + (variant % 3) * 1.5 - Math.abs(x - cx) * 0.15;
      const color = edge ? outline : hairZone ? hair : x > cx + rx * 0.45 ? skinDark : skin;
      setPixel(img, x, y, color);
    }
  const ey = Math.round(n * 0.5);
  for (const ex of [Math.round(n * 0.34), Math.round(n * 0.62)]) {
    setPixel(img, ex, ey, eye);
    setPixel(img, ex + 1, ey, eye);
    setPixel(img, ex, ey + 1, eye);
    setPixel(img, ex + 1, ey + 1, eye);
  }
  const my = Math.round(n * 0.72);
  for (let x = Math.round(n * 0.4); x <= Math.round(n * 0.6); x++) setPixel(img, x, my, mouth);
  return img;
}

export const PLACEHOLDER_VARIANTS = SKIN.length * HAIR.length;
