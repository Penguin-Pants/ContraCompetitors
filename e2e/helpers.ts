import type { Page } from '@playwright/test';

export interface GameState {
  k: number;
  narrow: boolean;
  scene: {
    scene: string;
    player: { x: number; y: number; grounded: boolean; blockedRight: boolean };
    timer: { state: 'waiting' | 'running' | 'stopped'; ms: number };
    finished: boolean;
  } & Record<string, unknown>;
}

export async function openGame(page: Page, query = 'e2e=manual') {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__lr !== undefined);
}

export function gameState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__lr!.state() as never);
}

/** Holds D and presses W when blocked on the ground, on the manual clock. Stops at the exit. */
export function scriptedRun(page: Page, maxFrames = 60 * 150) {
  return page.evaluate((maxFrames) => {
    const key = (type: string, code: string) =>
      window.dispatchEvent(new KeyboardEvent(type, { code }));
    key('keydown', 'KeyD');
    for (let i = 0; i < maxFrames; i++) {
      const s = (
        window.__lr!.state() as {
          scene: { player: { grounded: boolean; blockedRight: boolean }; finished: boolean };
        }
      ).scene;
      if (s.finished) break;
      if (s.player.grounded && s.player.blockedRight) {
        key('keydown', 'KeyW');
        window.__lr!.advance(1);
        key('keyup', 'KeyW');
      } else {
        window.__lr!.advance(1);
      }
    }
    key('keyup', 'KeyD');
  }, maxFrames);
}
