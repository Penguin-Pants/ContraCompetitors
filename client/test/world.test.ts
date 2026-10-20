import { describe, expect, test } from 'vitest';
import { STEP_MS } from '../src/engine/loop.ts';
import { World } from '../src/game/world.ts';
import { buildLevel } from '../src/level/levelData.ts';
import { ZONES } from '../src/level/zones.ts';
import { traverse } from './helpers/bot.ts';

const none = () => false;

describe('timer start (Q-4)', () => {
  test('stays at 0 with no input', () => {
    const w = new World(buildLevel());
    for (let i = 0; i < 120; i++) {
      w.step(none, []);
      w.frame(STEP_MS);
    }
    expect(w.timer.ms).toBe(0);
    expect(w.timer.state).toBe('waiting');
  });

  test('stays at 0 after Esc alone', () => {
    const w = new World(buildLevel());
    w.step(none, ['pause']);
    w.frame(STEP_MS);
    expect(w.timer.state).toBe('waiting');
    expect(w.timer.ms).toBe(0);
  });

  test.each(['left', 'right', 'jump', 'drop', 'fire'] as const)('starts on %s', (action) => {
    const w = new World(buildLevel());
    w.step(none, [action]);
    w.frame(STEP_MS);
    expect(w.timer.state).toBe('running');
    expect(w.timer.ms).toBeCloseTo(STEP_MS);
  });

  test('the player does not move before the first gameplay key', () => {
    const w = new World(buildLevel());
    const x = w.player.body.x;
    for (let i = 0; i < 30; i++) w.step(() => true, ['pause']);
    expect(w.player.body.x).toBe(x);
  });

  test('restart returns the timer to waiting', () => {
    const w = new World(buildLevel());
    w.step(none, ['right']);
    w.frame(500);
    w.restart();
    expect(w.timer.state).toBe('waiting');
    expect(w.timer.ms).toBe(0);
  });
});

describe('level', () => {
  test('three zones in order cover the level and the exit is the labeled shutter door in zone 3', () => {
    const level = buildLevel();
    expect(ZONES.map((z) => z.name)).toEqual([
      'Storage Aisle',
      'Shipping Dock and Truck Lot',
      'Receiving Bay Entrance',
    ]);
    expect(ZONES[0]!.col0).toBe(0);
    expect(ZONES[2]!.col1).toBe(level.map.cols - 1);
    const door = level.props.find((p) => p.kind === 'shutterDoor')!;
    expect(level.exit).toEqual({ x: door.x, y: door.y, w: door.w, h: door.h });
    expect(level.label).toBe('RECEIVING ZONE');
    expect(Math.floor(door.x / 16)).toBeGreaterThanOrEqual(ZONES[2]!.col0);
  });

  test('scripted traversal with no enemies reaches the exit in 40 to 70 s and stops the timer', () => {
    const w = new World({ ...buildLevel(), spawns: [] });
    traverse(w);
    expect(w.finished).toBe(true);
    expect(w.timer.state).toBe('stopped');
    const seconds = w.timer.ms / 1000;
    expect(seconds).toBeGreaterThanOrEqual(40);
    expect(seconds).toBeLessThanOrEqual(70);
    const stopped = w.timer.ms;
    w.frame(1000);
    expect(w.timer.ms).toBe(stopped);
  });
});
