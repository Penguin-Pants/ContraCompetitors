import type { Rect } from '../engine/collision.ts';
import { ENEMY_H, ENEMY_W, type EnemyKind } from '../game/enemies.ts';
import type { Pickup } from '../game/pickups.ts';
import { GROUP_GAP, GROUP_SIZE, type SpawnPoint } from '../game/spawn.ts';
import { ONEWAY, SOLID, TILE, TileMap } from './tilemap.ts';

export type PropKind =
  | 'pallet'
  | 'boxes'
  | 'rack'
  | 'terminalDoor'
  | 'dock'
  | 'container'
  | 'truckCab'
  | 'trailer'
  | 'steps'
  | 'conveyor'
  | 'bollard'
  | 'shutterDoor'
  | 'wall';

/** A drawn object in pixel coordinates. Its collision lives in the tile map. */
export interface Prop extends Rect {
  kind: PropKind;
}

export interface Level {
  map: TileMap;
  props: Prop[];
  spawn: { x: number; y: number };
  /** Touching this rect stops the timer (LIV-6). */
  exit: Rect;
  label: string;
  spawns: SpawnPoint[];
  /** Briefcase start state. The world copies these on every (re)start. */
  pickups: readonly Pickup[];
}

export const COLS = 300;
export const ROWS = 17;
/** Top row of the ground. */
export const FLOOR = 15;

/** Builds the one authored level: Storage Aisle, Shipping Dock and Truck Lot, Receiving Bay Entrance. */
export function buildLevel(): Level {
  const map = new TileMap(COLS, ROWS);
  const props: Prop[] = [];
  const px = (tx: number, ty: number, w: number, h: number) => ({
    x: tx * TILE,
    y: ty * TILE,
    w: w * TILE,
    h: h * TILE,
  });
  const decor = (kind: PropKind, tx: number, ty: number, w: number, h: number) =>
    props.push({ kind, ...px(tx, ty, w, h) });
  /** Solid block standing on the floor (or on `base` rows above it). */
  const block = (kind: PropKind, tx: number, w: number, h: number, base = 0) => {
    const top = FLOOR - base - h;
    map.fill(tx, top, tx + w - 1, FLOOR - base - 1, SOLID);
    decor(kind, tx, top, w, h);
  };
  const platform = (kind: PropKind, tx: number, w: number, row: number) => {
    map.fill(tx, row, tx + w - 1, row, ONEWAY);
    decor(kind, tx, row, w, 1);
  };
  const rack = (tx: number, w: number, rows: number[]) => {
    decor('rack', tx, Math.min(...rows), w, FLOOR - Math.min(...rows));
    for (const r of rows) map.fill(tx, r, tx + w - 1, r, ONEWAY);
  };

  map.fill(0, FLOOR, COLS - 1, ROWS - 1, SOLID);

  // Zone 1: Storage Aisle. Metal racking as step platforms, pallets and boxes.
  block('pallet', 10, 2, 1);
  block('boxes', 18, 2, 2);
  rack(24, 10, [12, 9]);
  block('pallet', 28, 2, 1);
  block('boxes', 38, 1, 1);
  block('boxes', 39, 2, 2);
  platform('rack', 46, 4, 13);
  platform('rack', 50, 4, 11);
  platform('rack', 54, 4, 9);
  block('pallet', 52, 3, 1);
  block('boxes', 62, 2, 2);
  rack(68, 10, [12, 9]);
  block('pallet', 72, 2, 1);
  block('boxes', 82, 2, 1);
  block('boxes', 84, 2, 2);
  block('pallet', 92, 2, 1);

  // Zone 2: Shipping Dock and Truck Lot. Terminal doors, raised dock, trucks, trailers, containers.
  decor('terminalDoor', 97, 7, 4, 8);
  block('dock', 102, 14, 2);
  block('container', 122, 6, 2);
  block('container', 124, 4, 2, 2);
  block('truckCab', 134, 3, 2);
  platform('trailer', 137, 14, 10);
  block('container', 156, 8, 2);
  block('container', 158, 6, 2, 2);
  block('truckCab', 172, 3, 2);
  platform('trailer', 175, 14, 10);
  block('container', 192, 4, 2);

  // Zone 3: Receiving Bay Entrance. Terminal steps, conveyor belts over processing lanes, shutter door.
  block('steps', 204, 3, 1);
  block('steps', 207, 3, 2);
  block('steps', 210, 11, 3);
  block('steps', 221, 3, 2);
  block('steps', 224, 3, 1);
  platform('conveyor', 232, 14, 12);
  block('bollard', 236, 1, 1);
  block('bollard', 242, 1, 1);
  platform('conveyor', 252, 14, 11);
  block('bollard', 256, 1, 1);
  block('bollard', 262, 1, 1);
  block('steps', 270, 3, 1);
  block('steps', 273, 3, 2);
  decor('shutterDoor', 286, 4, 8, 11);
  map.fill(294, 0, COLS - 1, FLOOR - 1, SOLID);
  decor('wall', 294, 0, COLS - 294, FLOOR);

  /** Top of the first solid tile in a column: the ground an enemy stands on. */
  const groundAt = (tx: number) => {
    for (let ty = 0; ty < ROWS; ty++) if (map.get(tx, ty) === SOLID) return ty * TILE;
    return FLOOR * TILE;
  };

  // Enemy spawn points, 9 per zone. W = walker, S = shooter.
  const spawnPlan: [number, EnemyKind][] = [
    [14, 'walker'],
    [22, 'walker'],
    [31, 'shooter'],
    [36, 'walker'],
    [45, 'walker'],
    [58, 'shooter'],
    [66, 'walker'],
    [79, 'shooter'],
    [88, 'walker'],
    [107, 'walker'],
    [113, 'shooter'],
    [120, 'walker'],
    [130, 'walker'],
    [146, 'shooter'],
    [154, 'walker'],
    [167, 'walker'],
    [181, 'shooter'],
    [196, 'walker'],
    [202, 'walker'],
    [215, 'shooter'],
    [228, 'walker'],
    [239, 'walker'],
    [247, 'shooter'],
    [258, 'walker'],
    [268, 'walker'],
    [278, 'shooter'],
    [283, 'walker'],
  ];
  /** True when no member of a group led from column `tx` overlaps a solid tile. */
  const groupClear = (tx: number, count: number) => {
    const y = groundAt(tx);
    const top = Math.floor((y - ENEMY_H) / TILE);
    const bottom = Math.ceil(y / TILE) - 1;
    for (let i = 0; i < count; i++) {
      const left = tx * TILE + TILE / 2 + i * GROUP_GAP - ENEMY_W / 2;
      for (let cx = Math.floor(left / TILE); cx <= Math.floor((left + ENEMY_W - 1) / TILE); cx++)
        for (let cy = top; cy <= bottom; cy++) if (map.get(cx, cy) === SOLID) return false;
    }
    return true;
  };
  /** Moves a planned column to the nearest one where the whole group stands in open space. */
  const clearColumn = (tx: number, count: number) => {
    for (let d = 0; d <= 12; d++)
      for (const c of [tx + d, tx - d]) if (groupClear(c, count)) return c;
    throw new Error(`no open space for the enemy group at column ${tx}`);
  };
  const spawns: SpawnPoint[] = spawnPlan.map(([planned, kind], id) => {
    const count = GROUP_SIZE[kind];
    const tx = clearColumn(planned, count);
    return { id, x: tx * TILE + TILE / 2, y: groundAt(tx), kind, count };
  });

  // Briefcases, 2 or 3 per zone, floating at head height above the ground.
  const pickupPlan: [number, Pickup['weapon']][] = [
    [16, 'spread'],
    [60, 'spread'],
    [110, 'laser'],
    [150, 'spread'],
    [186, 'laser'],
    [216, 'spread'],
    [248, 'laser'],
    [276, 'spread'],
  ];
  const pickups: Pickup[] = pickupPlan.map(([tx, weapon]) => ({
    x: tx * TILE + TILE / 2,
    y: groundAt(tx) - 26,
    weapon,
    taken: false,
  }));

  return {
    map,
    props,
    spawn: { x: 3 * TILE, y: FLOOR * TILE },
    exit: px(286, 4, 8, 11),
    label: 'RECEIVING ZONE',
    spawns,
    pickups,
  };
}
