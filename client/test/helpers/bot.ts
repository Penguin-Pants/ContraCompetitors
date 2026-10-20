import type { Action } from '../../src/engine/input.ts';
import { STEP_MS } from '../../src/engine/loop.ts';
import type { World } from '../../src/game/world.ts';

/** Holds D and presses W when blocked on the ground. Returns the number of steps until the exit. */
export function traverse(world: World, maxSteps = 60 * 120): number {
  const held = (a: Action) => a === 'right';
  let steps = 0;
  world.step(held, ['right']);
  world.frame(STEP_MS);
  while (!world.finished && steps < maxSteps) {
    const b = world.player.body;
    const presses: Action[] = b.grounded && b.blockedRight ? ['jump'] : [];
    world.step(held, presses);
    world.frame(STEP_MS);
    steps++;
  }
  return steps;
}
