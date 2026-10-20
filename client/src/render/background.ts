import { ART_W, PIXEL_SCALE } from '@lr/shared/render';
import type { Camera } from './camera.ts';
import type { Layers } from './layers.ts';
import { TILE } from '../level/tilemap.ts';
import { ZONES } from '../level/zones.ts';

/** L0: fixed-palette zone backdrops and warm light glows at device resolution. */
export function drawBackground(layers: Layers, cam: Camera) {
  const ctx = layers.bg.getContext('2d')!;
  const s = PIXEL_SCALE * layers.scale.k * layers.dpr;
  const W = layers.bg.width;
  const H = layers.bg.height;
  for (const zone of ZONES) {
    const x0 = (zone.col0 * TILE - cam.x) * s;
    const x1 = ((zone.col1 + 1) * TILE - cam.x) * s;
    if (x1 < 0 || x0 > W) continue;
    ctx.fillStyle = zone.palette.backdrop;
    ctx.fillRect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H);
    for (let lx = zone.col0 * TILE + 40; lx < (zone.col1 + 1) * TILE; lx += 160) {
      const sx = (lx - cam.x) * s;
      if (sx < -120 * s || sx > (ART_W + 120) * s) continue;
      const sy = 28 * s;
      const r = 70 * s;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `${zone.palette.glow}55`);
      g.addColorStop(1, `${zone.palette.glow}00`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }
}
