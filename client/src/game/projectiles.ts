import { SOLID, TILE, type TileMap } from '../level/tilemap.ts';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: 'player' | 'enemy';
  damage: number;
  /** Travel angle in radians, for the rotated sprite (RND-3). */
  angle: number;
  alive: boolean;
}

export const PROJECTILE_SIZE = 4;
const MAX_LIFE_PX = 600;

export function makeProjectile(
  x: number,
  y: number,
  vx: number,
  vy: number,
  owner: Projectile['owner'],
  damage: number,
): Projectile {
  return { x, y, vx, vy, owner, damage, angle: Math.atan2(vy, vx), alive: true };
}

export function projectileBox(p: Projectile) {
  return {
    x: p.x - PROJECTILE_SIZE / 2,
    y: p.y - PROJECTILE_SIZE / 2,
    w: PROJECTILE_SIZE,
    h: PROJECTILE_SIZE,
  };
}

/** Moves projectiles. Solid tiles stop them. Returns the points where projectiles hit a wall. */
export function updateProjectiles(list: Projectile[], map: TileMap, viewX: number, viewW: number) {
  const impacts: { x: number; y: number }[] = [];
  for (const p of list) {
    if (!p.alive) continue;
    p.x += p.vx;
    p.y += p.vy;
    if (map.get(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === SOLID) {
      p.alive = false;
      impacts.push({ x: p.x, y: p.y });
    } else if (
      p.x < viewX - 40 ||
      p.x > viewX + viewW + 40 ||
      p.y < -MAX_LIFE_PX ||
      p.y > map.rows * TILE
    ) {
      p.alive = false;
    }
  }
  return impacts;
}
