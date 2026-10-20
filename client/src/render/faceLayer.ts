import { PIXEL_SCALE } from '@lr/shared/render';
import { coverSquare } from '../faces/pixelate.ts';
import type { Layers } from './layers.ts';

/** L2: Smooth faces at device resolution, locked to the snapped camera (THM-4, Q-1). */
export class FaceLayer {
  private readonly layers: Layers;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(layers: Layers) {
    this.layers = layers;
    this.ctx = layers.face.getContext('2d')!;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.layers.face.width, this.layers.face.height);
  }

  /** Draws a face into the head box given in screen art pixels. */
  draw(bitmap: ImageBitmap, artX: number, artY: number, artSize: number) {
    const s = PIXEL_SCALE * this.layers.scale.k * this.layers.dpr;
    const x = artX * s;
    const y = artY * s;
    const size = artSize * s;
    const { sx, sy, size: src } = coverSquare(bitmap.width, bitmap.height);
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size / 2, size / 2 - s / 2, size / 2 - s / 4, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, src, src, x, y, size, size);
    ctx.restore();
  }
}
