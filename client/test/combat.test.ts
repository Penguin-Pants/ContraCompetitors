import { describe, expect, test } from 'vitest';
import { STEP_MS } from '../src/engine/loop.ts';
import { DIFFICULTY_TABLE } from '../src/game/difficulty.ts';
import { Enemy, ENEMY_HP } from '../src/game/enemies.ts';
import { INVULN_STEPS, Lives } from '../src/game/lives.ts';
import { collect } from '../src/game/pickups.ts';
import { activeSpawns } from '../src/game/spawn.ts';
import {
  BULLET_SPEED,
  laserEnd,
  laserTargets,
  LASER_MAX,
  spreadVelocities,
} from '../src/game/weapons.ts';
import { World } from '../src/game/world.ts';
import { buildLevel } from '../src/level/levelData.ts';
import { SOLID, TILE, TileMap } from '../src/level/tilemap.ts';
import { combatRun } from './helpers/combatBot.ts';

describe('spread gun', () => {
  test.each([1, -1] as const)('angles are symmetric around facing %i', (facing) => {
    const v = spreadVelocities(facing);
    expect(v).toHaveLength(3);
    expect(v[1]!.vy).toBeCloseTo(0);
    expect(Math.sign(v[1]!.vx)).toBe(facing);
    expect(v[0]!.vy).toBeCloseTo(-v[2]!.vy);
    expect(v[0]!.vx).toBeCloseTo(v[2]!.vx);
    for (const p of v) expect(Math.sign(p.vx)).toBe(facing);
    const deg = (Math.atan2(Math.abs(v[2]!.vy), Math.abs(v[2]!.vx)) * 180) / Math.PI;
    expect(deg).toBeCloseTo(15);
    for (const p of v) expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(BULLET_SPEED);
  });
});

describe('laser', () => {
  const map = new TileMap(40, 10);
  map.fill(20, 0, 20, 9, SOLID);
  const y = 5 * TILE + 4;
  const box = (x: number) => ({ box: { x, y: 4 * TILE, w: 20, h: 40 }, x });

  test('stops at the first solid tile in both directions', () => {
    expect(laserEnd(map, 5 * TILE, y, 1)).toBe(20 * TILE);
    expect(laserEnd(map, 30 * TILE, y, -1)).toBe(21 * TILE);
  });

  test('is capped at LASER_MAX in open space', () => {
    const open = new TileMap(100, 10);
    expect(laserEnd(open, 10, y, 1)).toBe(10 + LASER_MAX);
  });

  test('damages every enemy before the wall and none after it', () => {
    const targets = [box(8 * TILE), box(12 * TILE), box(18 * TILE), box(24 * TILE)];
    const end = laserEnd(map, 5 * TILE, y, 1);
    const hit = laserTargets(targets, 5 * TILE, end, y).map((t) => t.x);
    expect(hit).toEqual([8 * TILE, 12 * TILE, 18 * TILE]);
  });

  test('misses targets above or below the beam', () => {
    expect(laserTargets([box(8 * TILE)], 0, 300, 2 * TILE)).toEqual([]);
  });
});

describe('lives', () => {
  test('a hit during invulnerability costs no life; a hit after costs one', () => {
    const lives = new Lives();
    expect(lives.hit()).toBe('lost-life');
    expect(lives.count).toBe(2);
    expect(lives.hit()).toBe('ignored');
    expect(lives.count).toBe(2);
    for (let i = 0; i < INVULN_STEPS; i++) lives.tick();
    expect(lives.hit()).toBe('lost-life');
    expect(lives.count).toBe(1);
  });

  test('the third hit is game over', () => {
    const lives = new Lives();
    lives.hit();
    lives.invulnSteps = 0;
    lives.hit();
    lives.invulnSteps = 0;
    expect(lives.hit()).toBe('game-over');
  });
});

function startedWorld() {
  const w = new World(buildLevel(), 'medium');
  w.step(() => false, ['right']);
  return w;
}

/** Puts a walker on the player so the next step is a contact hit. */
function touch(w: World) {
  const b = w.player.body;
  const e = new Enemy('walker', 999, b.x + b.w / 2, b.y + b.h);
  w.enemies.push(e);
  w.step(() => false, []);
  w.enemies = w.enemies.filter((x) => x !== e);
}

describe('world combat rules', () => {
  test('a lost life resets the weapon to the pistol and respawns in place', () => {
    const w = startedWorld();
    w.weapon = 'laser';
    w.player.body.x = 40 * TILE;
    touch(w);
    expect(w.lives.count).toBe(2);
    expect(w.weapon).toBe('pistol');
    expect(Math.round(w.player.body.x)).toBe(40 * TILE);
    touch(w);
    expect(w.lives.count).toBe(2);
  });

  test('0 lives resets lives to 3, the timer to 0 and the player to the start', () => {
    const w = startedWorld();
    w.frame(5000);
    w.player.body.x = 60 * TILE;
    for (let i = 0; i < 3; i++) {
      w.lives.invulnSteps = 0;
      touch(w);
    }
    expect(w.lives.count).toBe(3);
    expect(w.timer.ms).toBe(0);
    expect(w.timer.state).toBe('waiting');
    expect(w.player.body.x).toBe(w.level.spawn.x - w.player.body.w / 2);
    expect(w.enemies).toEqual([]);
    expect(w.pickups.every((p) => !p.taken)).toBe(true);
  });

  test('collecting a briefcase replaces the current weapon', () => {
    const w = startedWorld();
    const p = w.pickups.find((x) => x.weapon === 'spread')!;
    const b = w.player.body;
    b.x = p.x - b.w / 2;
    b.y = p.y - 10;
    w.step(() => false, []);
    expect(w.weapon).toBe('spread');
    expect(p.taken).toBe(true);
    const laser = w.pickups.find((x) => x.weapon === 'laser')!;
    expect(collect([laser], { x: laser.x - 2, y: laser.y - 2, w: 4, h: 4 })).toBe(laser);
  });

  test('pistol bullets defeat a walker in 2 hits and a shooter in 3', () => {
    expect(ENEMY_HP.walker).toBe(2);
    expect(ENEMY_HP.shooter).toBe(3);
    const e = new Enemy('walker', 0, 100, 240);
    expect(e.damage(1)).toBe(false);
    expect(e.damage(1)).toBe(true);
    expect(e.alive).toBe(false);
  });

  test('pause-free world: the exit is reachable with enemies alive (LVL-5)', () => {
    const w = startedWorld();
    expect(w.activeSpawnCount).toBeGreaterThan(0);
    const b = w.player.body;
    b.x = w.level.exit.x - b.w - 2;
    b.y = 240 - b.h;
    w.enemies.push(new Enemy('walker', 998, 100, 240));
    for (let i = 0; i < 10 && !w.finished; i++) {
      w.step((a) => a === 'right', []);
      w.frame(STEP_MS);
    }
    expect(w.finished).toBe(true);
    expect(w.enemies.some((e) => e.alive)).toBe(true);
  });
});

describe('difficulty', () => {
  test('Hard speed > Medium > Easy; active spawns Hard >= Medium >= Easy', () => {
    const { easy, medium, hard } = DIFFICULTY_TABLE;
    expect(hard.enemySpeed).toBeGreaterThan(medium.enemySpeed);
    expect(medium.enemySpeed).toBeGreaterThan(easy.enemySpeed);
    expect(hard.activeSpawns).toBeGreaterThanOrEqual(medium.activeSpawns);
    expect(medium.activeSpawns).toBeGreaterThanOrEqual(easy.activeSpawns);
    expect(hard.fireInterval).toBeLessThan(easy.fireInterval);
  });

  test('active spawn sets are nested and sized by the table', () => {
    const { spawns } = buildLevel();
    const easy = activeSpawns(spawns, DIFFICULTY_TABLE.easy.activeSpawns);
    const medium = activeSpawns(spawns, DIFFICULTY_TABLE.medium.activeSpawns);
    const hard = activeSpawns(spawns, DIFFICULTY_TABLE.hard.activeSpawns);
    expect(hard.size).toBe(spawns.length);
    expect(medium.size).toBe(Math.round(spawns.length * 0.75));
    expect(easy.size).toBe(Math.round(spawns.length * 0.5));
    for (const id of easy) expect(medium.has(id)).toBe(true);
    for (const id of medium) expect(hard.has(id)).toBe(true);
  });

  test('2 or 3 briefcases per zone', () => {
    const { pickups } = buildLevel();
    const perZone = [0, 0, 0];
    for (const p of pickups) perZone[Math.min(2, Math.floor(p.x / TILE / 100))]!++;
    for (const n of perZone) expect([2, 3]).toContain(n);
  });
});

describe('pacing proxy', () => {
  test('a combat bot on Medium finishes in 60 to 120 s', () => {
    const r = combatRun(new World(buildLevel(), 'medium'));
    expect(r.finished).toBe(true);
    expect(r.seconds).toBeGreaterThanOrEqual(60);
    expect(r.seconds).toBeLessThanOrEqual(120);
  });
});
