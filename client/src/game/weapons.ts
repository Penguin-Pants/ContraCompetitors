import { SOLID, TILE, type TileMap } from '../level/tilemap.ts';
import type { Rect } from '../engine/collision.ts';

export type WeaponKind = 'pistol' | 'spread' | 'laser';

export const WEAPON_NAMES: Readonly<Record<WeaponKind, string>> = {
  pistol: 'Standard Pistol',
  spread: 'Spread Gun',
  laser: 'Laser Rifle',
};

/** Steps between shots. Ammo is unlimited for all weapons (build plan 4.1). */
export const FIRE_COOLDOWN: Readonly<Record<'pistol' | 'spread', number>> = {
  pistol: 10,
  spread: 16,
};
export const BULLET_SPEED = 5;
export const BULLET_DAMAGE = 1;
export const SPREAD_DEG = 15;
/** Laser damage per second (high: a walker dies in about 0.13 s). */
export const LASER_DPS = 15;
/** Longest beam in art pixels (a little more than one screen). */
export const LASER_MAX = 520;

export interface Vec {
  vx: number;
  vy: number;
}

/** Three-way fan centered on the facing direction: -15, 0 and +15 degrees (WPN-3). */
export function spreadVelocities(facing: 1 | -1, speed = BULLET_SPEED): Vec[] {
  return [-SPREAD_DEG, 0, SPREAD_DEG].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { vx: facing * Math.cos(a) * speed, vy: Math.sin(a) * speed };
  });
}

export function pistolVelocity(facing: 1 | -1, speed = BULLET_SPEED): Vec {
  return { vx: facing * speed, vy: 0 };
}

/**
 * Horizontal beam from (x, y) in the facing direction. Returns the beam end, stopped by the first
 * solid tile on the beam row or by LASER_MAX (WPN-4).
 */
export function laserEnd(map: TileMap, x: number, y: number, facing: 1 | -1): number {
  const ty = Math.floor(y / TILE);
  let tx = Math.floor(x / TILE);
  const limit = x + facing * LASER_MAX;
  for (;;) {
    if (map.get(tx, ty) === SOLID) {
      const edge = facing > 0 ? tx * TILE : (tx + 1) * TILE;
      return facing > 0 ? Math.max(x, Math.min(edge, limit)) : Math.min(x, Math.max(edge, limit));
    }
    const next = facing > 0 ? (tx + 1) * TILE : tx * TILE;
    if ((facing > 0 && next >= limit) || (facing < 0 && next <= limit)) return limit;
    tx += facing;
  }
}

/** Targets the beam from x to end at height y passes through. The beam pierces all of them. */
export function laserTargets<T extends { box: Rect }>(
  targets: readonly T[],
  x: number,
  end: number,
  y: number,
): T[] {
  const lo = Math.min(x, end);
  const hi = Math.max(x, end);
  return targets.filter(
    (t) => y >= t.box.y && y < t.box.y + t.box.h && t.box.x < hi && t.box.x + t.box.w > lo,
  );
}
