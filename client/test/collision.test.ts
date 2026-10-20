import { describe, expect, test } from 'vitest';
import { makeBody, moveBody, type Body } from '../src/engine/collision.ts';
import { applyGravity, JUMP_SPEED } from '../src/engine/physics.ts';
import { ONEWAY, SOLID, TILE, TileMap } from '../src/level/tilemap.ts';

// 10 x 10 map: floor at row 9, one-way platform at row 6 (cols 2-7), solid block at row 3 (cols 2-7).
function map(platform: typeof ONEWAY | typeof SOLID = ONEWAY) {
  const m = new TileMap(10, 10);
  m.fill(0, 9, 9, 9, SOLID);
  m.fill(2, 6, 7, 6, platform);
  return m;
}

function simulate(body: Body, m: TileMap, steps: number, ignoreOneWay = false) {
  for (let i = 0; i < steps; i++) {
    body.vy = applyGravity(body.vy);
    moveBody(body, m, ignoreOneWay);
  }
}

function standOnFloor(): Body {
  const b = makeBody(3 * TILE, 9 * TILE - 20, 10, 20);
  return b;
}

describe('one-way platforms', () => {
  test('a jump from below passes up through and lands on top', () => {
    const m = map();
    const b = standOnFloor();
    simulate(b, m, 2);
    expect(b.grounded).toBe(true);
    b.vy = -JUMP_SPEED;
    simulate(b, m, 120);
    expect(b.grounded).toBe(true);
    expect(b.onOneWay).toBe(true);
    expect(b.y + b.h).toBe(6 * TILE);
  });

  test('drop (ignore one-way) falls through to the floor', () => {
    const m = map();
    const b = makeBody(3 * TILE, 6 * TILE - 20, 10, 20);
    simulate(b, m, 2);
    expect(b.onOneWay).toBe(true);
    simulate(b, m, 3, true);
    simulate(b, m, 60);
    expect(b.y + b.h).toBe(9 * TILE);
    expect(b.onOneWay).toBe(false);
  });

  test('a solid tile blocks a jump from below and cannot be dropped through', () => {
    const m = map(SOLID);
    const b = standOnFloor();
    simulate(b, m, 2);
    b.vy = -JUMP_SPEED;
    simulate(b, m, 120);
    expect(b.y + b.h).toBe(9 * TILE);
    const top = makeBody(3 * TILE, 6 * TILE - 20, 10, 20);
    simulate(top, m, 30, true);
    expect(top.y + top.h).toBe(6 * TILE);
    expect(top.grounded).toBe(true);
  });

  test('solid tiles block sideways motion; one-way tiles do not', () => {
    const m = new TileMap(10, 10);
    m.fill(0, 9, 9, 9, SOLID);
    m.fill(5, 8, 5, 8, SOLID);
    m.fill(2, 8, 2, 8, ONEWAY);
    const b = makeBody(3 * TILE, 9 * TILE - 10, 10, 10);
    b.vx = 3;
    for (let i = 0; i < 20; i++) moveBody(b, m, false);
    expect(b.x + b.w).toBe(5 * TILE);
    expect(b.blockedRight).toBe(true);
    b.vx = -3;
    for (let i = 0; i < 40; i++) moveBody(b, m, false);
    expect(b.x).toBe(0);
  });
});
