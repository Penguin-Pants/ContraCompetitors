import { PIXEL_SCALE } from '@lr/shared/render';
import type { PixelCanvas } from '../render/pixelCanvas.ts';
import type { Particles } from './particles.ts';

/** Steps the face grows before it bursts. */
export const POP_GROW_STEPS = 8;

/**
 * Pop source. `grid` is the pixel grid of the image: 'art' (placeholder heads, one image pixel per
 * art pixel) or 'fine' (faces, one image pixel per L1 pixel). Growth resamples with nearest
 * neighbor on that grid, so the pop never leaves it.
 */
export interface PopSource {
  img: CanvasImageSource & { width: number; height: number };
  grid: 'art' | 'fine';
  colors: readonly string[];
}

interface Pop {
  /** Head center in world art pixels. */
  x: number;
  y: number;
  src: PopSource;
  t: number;
}

/** Non-gory face pop (ENM-3): the face grows, then bursts into confetti in its own colors. L1 only. */
export class FacePops {
  private list: Pop[] = [];
  private readonly scratch = document.createElement('canvas');

  add(x: number, y: number, src: PopSource) {
    this.list.push({ x, y, src, t: 0 });
  }

  get count(): number {
    return this.list.length;
  }

  /** One step. Called from the scene update, so pause freezes it. */
  update(fx: Particles) {
    for (const pop of this.list) {
      pop.t++;
      if (pop.t < POP_GROW_STEPS) continue;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const s = 0.8 + fx.rand() * 1.6;
        fx.add({
          x: pop.x,
          y: pop.y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 0.8,
          life: 18 + Math.floor(fx.rand() * 16),
          color: pop.src.colors[i % pop.src.colors.length]!,
          gravity: 0.08,
          size: i % 4 === 0 ? 2 : 1,
        });
      }
    }
    this.list = this.list.filter((p) => p.t < POP_GROW_STEPS);
  }

  draw(p: PixelCanvas, camX: number, camY: number) {
    for (const pop of this.list) {
      const { img, grid } = pop.src;
      const size = Math.round(img.width * (1 + 0.06 * pop.t));
      const c = this.scratch;
      c.width = size;
      c.height = size;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, size, size);
      const cx = pop.x - camX;
      const cy = pop.y - camY;
      if (grid === 'art') {
        p.sprite(
          { w: size, h: size, canvas: c },
          Math.round(cx - size / 2),
          Math.round(cy - size / 2),
        );
      } else {
        p.fine(
          c,
          Math.round(cx * PIXEL_SCALE - size / 2),
          Math.round(cy * PIXEL_SCALE - size / 2),
          size,
          size,
        );
      }
    }
  }

  clear() {
    this.list = [];
  }
}
