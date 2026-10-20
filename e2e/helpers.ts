import type { Page } from '@playwright/test';
import { decide } from '../client/test/helpers/combatBot.ts';

export interface GameState {
  k: number;
  narrow: boolean;
  scene: {
    scene: string;
    player: { x: number; y: number; grounded: boolean; blockedRight: boolean };
    timer: { state: 'waiting' | 'running' | 'stopped'; ms: number };
    finished: boolean;
    lives: number;
    weapon: string;
    laser: boolean;
    enemies: number;
    projectiles: number;
    particles: number;
    paused: boolean;
  };
}

export async function openGame(page: Page, query = 'e2e=manual') {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__lr !== undefined);
}

export function gameState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__lr!.state() as never);
}

/**
 * Plays the level on the manual clock with the shared combat bot (client/test/helpers/combatBot.ts)
 * until the exit or `maxFrames`.
 */
export function scriptedRun(page: Page, maxFrames = 60 * 200) {
  return page.evaluate(
    ({ src, maxFrames }) => {
      const decide = new Function(`return (${src});`)() as (
        w: unknown,
        m: { waited: number },
      ) => { held: string[]; presses: string[] };
      const CODES: Record<string, string> = {
        left: 'KeyA',
        right: 'KeyD',
        jump: 'KeyW',
        drop: 'KeyS',
        fire: 'Space',
      };
      const key = (type: string, code: string) =>
        window.dispatchEvent(new KeyboardEvent(type, { code }));
      const memo = { waited: 0 };
      const down = new Set<string>();
      for (let i = 0; i < maxFrames; i++) {
        const world = window.__lr!.world() as { finished: boolean };
        if (world.finished) break;
        const d = decide(world, memo);
        for (const a of Object.keys(CODES)) {
          const want = d.held.includes(a);
          if (want && !down.has(a)) {
            key('keydown', CODES[a]!);
            down.add(a);
          } else if (!want && down.has(a) && !d.presses.includes(a)) {
            key('keyup', CODES[a]!);
            down.delete(a);
          }
        }
        for (const a of d.presses) {
          if (down.has(a)) key('keyup', CODES[a]!);
          key('keydown', CODES[a]!);
          down.add(a);
        }
        window.__lr!.advance(1);
        for (const a of d.presses) {
          if (!d.held.includes(a)) {
            key('keyup', CODES[a]!);
            down.delete(a);
          }
        }
      }
      for (const a of down) key('keyup', CODES[a]!);
    },
    { src: decide.toString(), maxFrames },
  );
}

/** Runs right with fire held on the manual clock until `done(state)` or `maxFrames`. */
export function runUntil(
  page: Page,
  until: string,
  opts: { fire?: boolean; maxFrames?: number } = {},
) {
  return page.evaluate(
    ({ until, fire, maxFrames }) => {
      const done = new Function('s', `return (${until});`) as (s: unknown) => boolean;
      const key = (type: string, code: string) =>
        window.dispatchEvent(new KeyboardEvent(type, { code }));
      key('keydown', 'KeyD');
      if (fire) key('keydown', 'Space');
      for (let i = 0; i < maxFrames; i++) {
        const s = (
          window.__lr!.state() as {
            scene: { player: { grounded: boolean; blockedRight: boolean } };
          }
        ).scene;
        if (done(s)) return true;
        if (s.player.grounded && s.player.blockedRight) {
          key('keydown', 'KeyW');
          window.__lr!.advance(1);
          key('keyup', 'KeyW');
        } else {
          window.__lr!.advance(1);
        }
      }
      return false;
    },
    { until, fire: opts.fire ?? false, maxFrames: opts.maxFrames ?? 60 * 120 },
  );
}

export function releaseAll(page: Page) {
  return page.evaluate(() => {
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'])
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  });
}
