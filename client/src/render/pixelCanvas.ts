import { L1_H, L1_W, PIXEL_SCALE } from '@lr/shared/render';
import type { Surface } from './surface.ts';

/**
 * The only writer to L1. All art draws at exactly PIXEL_SCALE with whole-pixel coordinates
 * (RND-1, RND-2). Coordinates are rounded here, so callers can keep float world positions.
 */
export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = L1_W;
    canvas.height = L1_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  clear() {
    this.ctx.clearRect(0, 0, L1_W, L1_H);
  }

  /** Draws a sprite with its top-left at art pixel (x, y). */
  sprite(s: Surface, x: number, y: number, flip = false) {
    const px = Math.round(x) * PIXEL_SCALE;
    const py = Math.round(y) * PIXEL_SCALE;
    const w = s.w * PIXEL_SCALE;
    const h = s.h * PIXEL_SCALE;
    if (flip) {
      this.ctx.save();
      this.ctx.translate(px + w, py);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(s.canvas, 0, 0, s.w, s.h, 0, 0, w, h);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(s.canvas, 0, 0, s.w, s.h, px, py, w, h);
    }
  }

  /** Fills an art-pixel rectangle. */
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      Math.round(x) * PIXEL_SCALE,
      Math.round(y) * PIXEL_SCALE,
      Math.round(w) * PIXEL_SCALE,
      Math.round(h) * PIXEL_SCALE,
    );
  }

  /** Draws a source at L1-pixel resolution (half art pixel). Used for Pixelated faces (THM-5). */
  fine(src: CanvasImageSource, x: number, y: number, w: number, h: number) {
    this.ctx.drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Fills an L1-pixel rectangle (half art pixel grid). */
  fineRect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
}
