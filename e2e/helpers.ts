import type { Page } from '@playwright/test';
import { decide } from '../client/test/helpers/combatBot.ts';
import type { IngestResponse } from '../shared/src/api.ts';
import { ingestResponse, mockIngest } from './fixtures.ts';

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
    faceStyle: 'smooth' | 'pixelated';
    faceDraws: { l1: number; l2: number };
    faceIds: string[];
    theme: { primary: string; secondary: string };
    pops: number;
    gain: number | null;
    audio: AudioContextState | null;
    difficulty: string;
  };
}

export interface StartOptions {
  /** Query string, e.g. 'e2e=manual' (default) or 'e2e' for the real-time clock. */
  query?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  faceStyle?: 'auto' | 'smooth' | 'pixelated';
  /** Ingest response; default is 2 colors and no faces. Pass null to leave /api/ingest unmocked. */
  ingest?: IngestResponse | null;
  viewport?: { width: number; height: number };
}

/** Opens the app, mocks ingestion, fills the main menu and starts a run. */
export async function startRun(page: Page, opts: StartOptions = {}) {
  await page.setViewportSize(opts.viewport ?? { width: 1280, height: 720 });
  if (opts.ingest !== null) await mockIngest(page, opts.ingest ?? ingestResponse());
  await page.goto(`/?${opts.query ?? 'e2e=manual'}`);
  await page.waitForFunction(() => window.__lr !== undefined);
  await page.getByLabel('Company website').fill('example.test');
  await page.getByLabel(LABEL[opts.difficulty ?? 'medium']!, { exact: true }).check();
  await page.getByLabel(LABEL[opts.faceStyle ?? 'auto']!, { exact: true }).check();
  await page.getByRole('button', { name: 'Start' }).click();
}

/** Starts a run and waits for the game scene. */
export async function openGame(page: Page, query = 'e2e=manual', opts: StartOptions = {}) {
  await startRun(page, { ...opts, query });
  await page.waitForFunction(
    () => (window.__lr!.state() as { scene: { scene: string } }).scene.scene === 'game',
  );
}

const LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  auto: 'Auto',
  smooth: 'Smooth',
  pixelated: 'Pixelated',
};

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
