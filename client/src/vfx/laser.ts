import type { PixelCanvas } from '../render/pixelCanvas.ts';
import type { LaserBeam } from '../game/world.ts';

/** Continuous laser beam on L1 (RND-4). `t` animates the flicker. */
export function drawLaser(p: PixelCanvas, beam: LaserBeam, camX: number, camY: number, t: number) {
  const x0 = Math.round(Math.min(beam.x, beam.end)) - camX;
  const x1 = Math.round(Math.max(beam.x, beam.end)) - camX;
  const y = Math.round(beam.y) - camY;
  const w = x1 - x0;
  if (w <= 0) return;
  const wide = t % 4 < 2;
  p.rect(x0, y - (wide ? 2 : 1), w, wide ? 5 : 3, '#1fb6ff');
  p.rect(x0, y - 1, w, 3, '#7fe3ff');
  p.rect(x0, y, w, 1, '#ffffff');
  const ex = beam.end >= beam.x ? x1 : x0;
  p.rect(ex - 2, y - 3, 4, 7, t % 2 ? '#ffffff' : '#7fe3ff');
}
