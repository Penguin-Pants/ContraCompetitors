import { overlaps, type Rect } from '../engine/collision.ts';
import type { WeaponKind } from './weapons.ts';

export const PICKUP_W = 14;
export const PICKUP_H = 11;

/** A floating briefcase power-up (WPN-1). */
export interface Pickup {
  x: number;
  y: number;
  weapon: Exclude<WeaponKind, 'pistol'>;
  taken: boolean;
}

export function pickupBox(p: Pickup): Rect {
  return { x: p.x - PICKUP_W / 2, y: p.y - PICKUP_H / 2, w: PICKUP_W, h: PICKUP_H };
}

/** Returns the pickup the body collects this step, if any, and marks it taken. */
export function collect(pickups: readonly Pickup[], body: Rect): Pickup | null {
  for (const p of pickups) {
    if (!p.taken && overlaps(body, pickupBox(p))) {
      p.taken = true;
      return p;
    }
  }
  return null;
}
