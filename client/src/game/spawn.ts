import type { EnemyKind } from './enemies.ts';

export interface SpawnPoint {
  id: number;
  x: number;
  /** Ground height (feet) at x. */
  y: number;
  kind: EnemyKind;
  /** Enemies released by this point, spaced GROUP_GAP apart behind each other. */
  count: number;
}

export const GROUP_GAP = 26;
/** Group size per enemy type. */
export const GROUP_SIZE: Readonly<Record<EnemyKind, number>> = { walker: 3, shooter: 2 };

/** Deterministic rank in [0, 1) per spawn point, so the active sets are stable across runs. */
export function spawnRank(id: number): number {
  let h = (id + 1) * 2654435761;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Active spawn ids for a fraction of all points. The lowest-ranked points are taken first, so
 * a higher fraction always contains every point of a lower one (Hard >= Medium >= Easy).
 */
export function activeSpawns(points: readonly SpawnPoint[], fraction: number): Set<number> {
  const count = Math.round(points.length * fraction);
  const sorted = [...points].sort((a, b) => spawnRank(a.id) - spawnRank(b.id));
  return new Set(sorted.slice(0, count).map((p) => p.id));
}

/** Distance ahead of the camera's right edge at which a spawn point activates. */
export const ACTIVATE_AHEAD = 24;
