import { ONEWAY, SOLID, TILE, type TileMap } from '../level/tilemap.ts';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** True when the body stands on a one-way platform. */
  onOneWay: boolean;
  blockedLeft: boolean;
  blockedRight: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return {
    x,
    y,
    w,
    h,
    vx: 0,
    vy: 0,
    grounded: false,
    onOneWay: false,
    blockedLeft: false,
    blockedRight: false,
  };
}

const EPS = 1e-6;

function colRange(x: number, w: number): [number, number] {
  return [Math.floor(x / TILE), Math.floor((x + w - EPS) / TILE)];
}

/** Moves a body by its velocity against the tile map, x first, then y. */
export function moveBody(body: Body, map: TileMap, ignoreOneWay: boolean) {
  body.blockedLeft = false;
  body.blockedRight = false;
  if (body.vx !== 0) {
    body.x += body.vx;
    const [ty0, ty1] = colRange(body.y, body.h);
    if (body.vx > 0) {
      const tx = Math.floor((body.x + body.w - EPS) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (map.get(tx, ty) === SOLID) {
          body.x = tx * TILE - body.w;
          body.blockedRight = true;
          break;
        }
      }
    } else {
      const tx = Math.floor(body.x / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (map.get(tx, ty) === SOLID) {
          body.x = (tx + 1) * TILE;
          body.blockedLeft = true;
          break;
        }
      }
    }
  }

  const prevBottom = body.y + body.h;
  body.y += body.vy;
  body.grounded = false;
  body.onOneWay = false;
  const [tx0, tx1] = colRange(body.x, body.w);
  if (body.vy > 0) {
    const bottom = body.y + body.h;
    const ty = Math.floor((bottom - EPS) / TILE);
    let landed: 'solid' | 'oneway' | null = null;
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = map.get(tx, ty);
      if (t === SOLID) {
        landed = 'solid';
        break;
      }
      if (t === ONEWAY && !ignoreOneWay && prevBottom <= ty * TILE + EPS) landed = 'oneway';
    }
    if (landed) {
      body.y = ty * TILE - body.h;
      body.vy = 0;
      body.grounded = true;
      body.onOneWay = landed === 'oneway';
    }
  } else if (body.vy < 0) {
    const ty = Math.floor(body.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (map.get(tx, ty) === SOLID) {
        body.y = (ty + 1) * TILE;
        body.vy = 0;
        break;
      }
    }
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
