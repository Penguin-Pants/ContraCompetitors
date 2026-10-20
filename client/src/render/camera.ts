import { ART_H, ART_W } from '@lr/shared/render';

/** Follows a target and snaps to whole art pixels. L1 and L2 share this camera. */
export class Camera {
  x = 0;
  y = 0;

  private worldW: number;
  private worldH: number;

  constructor(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  setWorld(worldW: number, worldH: number) {
    this.worldW = worldW;
    this.worldH = worldH;
  }

  /** Keeps the target at one third of the view width, clamped to the world. */
  follow(targetX: number, targetY: number) {
    const x = targetX - ART_W / 3;
    const y = targetY - ART_H / 2;
    this.x = Math.round(Math.min(Math.max(0, x), Math.max(0, this.worldW - ART_W)));
    this.y = Math.round(Math.min(Math.max(0, y), Math.max(0, this.worldH - ART_H)));
  }
}
