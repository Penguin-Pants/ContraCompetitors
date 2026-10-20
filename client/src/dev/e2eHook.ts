import type { Loop } from '../engine/loop.ts';
import { STEP_MS } from '../engine/loop.ts';

/**
 * Test hook, enabled only with the `?e2e` query flag. With `?e2e=manual` the loop runs on a manual
 * clock: time advances only through `advance(frames)`, so scripted E2E runs are deterministic.
 */
export interface E2EHook {
  advance(frames: number): void;
  state(): unknown;
  /** The live game world, for E2E bots. Undefined outside the game scene. */
  world(): unknown;
}

declare global {
  interface Window {
    __lr?: E2EHook;
  }
}

export function e2eMode(): 'off' | 'auto' | 'manual' {
  const v = new URLSearchParams(location.search).get('e2e');
  if (v === null) return 'off';
  return v === 'manual' ? 'manual' : 'auto';
}

export function installE2EHook(loop: Loop, state: () => unknown, world: () => unknown) {
  const mode = e2eMode();
  if (mode === 'off') return;
  loop.manual = mode === 'manual';
  window.__lr = {
    advance(frames: number) {
      for (let i = 0; i < frames; i++) loop.tick(STEP_MS);
    },
    state,
    world,
  };
}
