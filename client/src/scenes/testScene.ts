import { ART_H, ART_W } from '@lr/shared/render';
import { fromRows, scaleInt } from '../render/pixelImage.ts';
import { rotatePixels } from '../render/rotate.ts';
import { toSurface, type Surface } from '../render/surface.ts';
import type { Scene, SceneContext } from './scene.ts';

const CRATE = fromRows(
  [
    'oooooooooooooooo',
    'obbbbbbbbbbbbbbo',
    'obllllllllllllbo',
    'oblddddddddddlbo',
    'obldyyyyyyyydlbo',
    'obldyrrrrrrydlbo',
    'obldyrggggrydlbo',
    'obldyrgwwgrydlbo',
    'obldyrgwwgrydlbo',
    'obldyrggggrydlbo',
    'obldyrrrrrrydlbo',
    'obldyyyyyyyydlbo',
    'oblddddddddddlbo',
    'obllllllllllllbo',
    'obbbbbbbbbbbbbbo',
    'oooooooooooooooo',
  ],
  {
    o: '#1b1f2a',
    b: '#8a5a2b',
    l: '#c08040',
    d: '#5e3a1a',
    y: '#f2c14e',
    r: '#d94f3d',
    g: '#3fa46a',
    w: '#f4f4f4',
  },
);

const BACKDROP = '#1d2433';
const FLOOR = '#3b4252';

/** Phase 2 test scene: a code-drawn sprite that moves, a fixed 30 degree rotation, a spinning copy and a 2x scale. */
export function createTestScene(ctx: SceneContext): Scene {
  const base = toSurface(CRATE);
  const rotated30 = toSurface(rotatePixels(CRATE, Math.PI / 6));
  const scaled = toSurface(scaleInt(CRATE, 2));
  const spinCache = new Map<number, Surface>();
  let t = 0;
  let x = 40;
  let dir = 1;

  const spinAt = (deg: number) => {
    let s = spinCache.get(deg);
    if (!s) {
      s = toSurface(rotatePixels(CRATE, (deg * Math.PI) / 180));
      spinCache.set(deg, s);
    }
    return s;
  };

  const bg = ctx.layers.bg.getContext('2d')!;

  return {
    update(stepMs) {
      t += stepMs;
      x += dir * 0.75;
      if (x > ART_W - 60 || x < 20) dir = -dir;
      const { input } = ctx;
      if (input.isHeld('left')) x -= 1;
      if (input.isHeld('right')) x += 1;
    },
    frame() {},
    render() {
      bg.fillStyle = BACKDROP;
      bg.fillRect(0, 0, ctx.layers.bg.width, ctx.layers.bg.height);
      const p = ctx.pixels;
      p.clear();
      p.rect(0, ART_H - 40, ART_W, 40, FLOOR);
      p.sprite(base, x, ART_H - 56, dir < 0);
      p.sprite(rotated30, 60, 60);
      const deg = Math.floor(t / 50) % 360;
      const spin = spinAt(deg);
      p.sprite(spin, 200 - Math.floor(spin.w / 2), 80 - Math.floor(spin.h / 2));
      p.sprite(scaled, 320, 60);
    },
    paused: () => false,
    state: () => ({ scene: 'test', x, t }),
  };
}
