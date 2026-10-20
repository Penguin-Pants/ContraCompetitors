import { HEAD_W_ART } from '@lr/shared/render';
import { animationFrame } from '../assets/manifest.ts';
import type { LoadedSheet } from '../assets/loader.ts';
import { BULLETS } from '../assets/placeholders.ts';
import { DEFEAT_STEPS, type Enemy } from '../game/enemies.ts';
import { PICKUP_H, PICKUP_W } from '../game/pickups.ts';
import type { World } from '../game/world.ts';
import { placeholderHead } from '../faces/placeholders.ts';
import type { PixelCanvas } from '../render/pixelCanvas.ts';
import { silhouette } from '../render/pixelImage.ts';
import { rotatePixels } from '../render/rotate.ts';
import { toSurface, type Surface } from '../render/surface.ts';
import { drawLaser } from '../vfx/laser.ts';

export interface GameSheets {
  player: LoadedSheet;
  walker: LoadedSheet;
  shooter: LoadedSheet;
  briefcase: LoadedSheet;
}

/** Where an enemy's head goes this frame, in screen art pixels. */
export interface HeadBox {
  enemy: Enemy;
  x: number;
  y: number;
  size: number;
  /** Pixel-hit flash: the head draws as a white shape on L1. */
  flashing: boolean;
}

const FLASH = '#ffffff';

/** Draws world entities on L1. Holds surface caches that depend only on the sheets. */
export class EntityRenderer {
  private readonly sheets: GameSheets;
  private readonly flash = new Map<LoadedSheet, Surface[]>();
  private readonly heads = new Map<number, Surface>();
  private readonly bullets = new Map<string, Surface>();

  constructor(sheets: GameSheets) {
    this.sheets = sheets;
    for (const s of [sheets.walker, sheets.shooter]) {
      this.flash.set(
        s,
        s.images.map((img) => toSurface(silhouette(img, FLASH))),
      );
    }
  }

  placeholder(variant: number): Surface {
    let s = this.heads.get(variant);
    if (!s) {
      s = toSurface(placeholderHead(variant));
      this.heads.set(variant, s);
    }
    return s;
  }

  private bullet(owner: 'player' | 'enemy', angle: number): Surface {
    const deg = (((Math.round((angle * 180) / Math.PI / 5) * 5) % 360) + 360) % 360;
    const key = `${owner}:${deg}`;
    let s = this.bullets.get(key);
    if (!s) {
      s = toSurface(rotatePixels(BULLETS[owner], (deg * Math.PI) / 180));
      this.bullets.set(key, s);
    }
    return s;
  }

  /** Draws enemy bodies and returns the head boxes of live enemies. Heads are drawn by the caller. */
  enemies(p: PixelCanvas, world: World, animMs: number): HeadBox[] {
    const cam = world.camera;
    const boxes: HeadBox[] = [];
    for (const e of world.enemies) {
      const sheet = e.kind === 'walker' ? this.sheets.walker : this.sheets.shooter;
      const anims = sheet.spec.animations;
      const alive = e.alive;
      const anim = !alive
        ? anims.defeat!
        : e.kind === 'shooter' && e.body.vx === 0 && anims.shoot
          ? anims.shoot
          : anims.walk!;
      const frame = animationFrame(anim, animMs + e.spawnId * 137);
      const flashing = e.flashSteps > 0 || (!alive && e.defeatSteps < 6);
      if (!alive && e.defeatSteps > DEFEAT_STEPS - 10 && e.defeatSteps % 2) continue;
      const surfaces = flashing ? this.flash.get(sheet)! : sheet.surfaces;
      const fx = Math.round(e.body.x) - cam.x - 2;
      const fy = Math.round(e.body.y + e.body.h) - cam.y - sheet.spec.frameH;
      const flip = e.facing < 0;
      p.sprite(surfaces[frame]!, fx, fy, flip);
      if (!alive) continue;
      const anchor = sheet.spec.frames[frame]!.head!;
      const ax = flip ? sheet.spec.frameW - anchor.x : anchor.x;
      const hx = fx + ax - HEAD_W_ART / 2;
      const hy = fy + anchor.y + 4 - HEAD_W_ART;
      boxes.push({ enemy: e, x: hx, y: hy, size: HEAD_W_ART, flashing });
    }
    return boxes;
  }

  /** White head shape for the pixel-hit flash. */
  flashHead(p: PixelCanvas, box: HeadBox) {
    p.rect(box.x + 3, box.y + 2, box.size - 6, box.size - 3, FLASH);
  }

  projectiles(p: PixelCanvas, world: World) {
    const cam = world.camera;
    for (const pr of world.projectiles) {
      if (!pr.alive) continue;
      const s = this.bullet(pr.owner, pr.angle);
      p.sprite(s, Math.round(pr.x - s.w / 2) - cam.x, Math.round(pr.y - s.h / 2) - cam.y);
    }
  }

  pickups(p: PixelCanvas, world: World, animMs: number) {
    const cam = world.camera;
    const sheet = this.sheets.briefcase;
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const bob = Math.round(Math.sin(animMs / 250) * 2);
      const frame = animationFrame(sheet.spec.animations[pk.weapon]!, 0);
      p.sprite(
        sheet.surfaces[frame]!,
        Math.round(pk.x - PICKUP_W / 2) - cam.x,
        Math.round(pk.y - PICKUP_H / 2) + bob - cam.y,
      );
    }
  }

  particles(p: PixelCanvas, world: World) {
    const cam = world.camera;
    for (const pt of world.fx.list)
      p.rect(Math.round(pt.x) - cam.x, Math.round(pt.y) - cam.y, pt.size, pt.size, pt.color);
  }

  laser(p: PixelCanvas, world: World, step: number) {
    if (world.laser) drawLaser(p, world.laser, world.camera.x, world.camera.y, step);
  }
}
