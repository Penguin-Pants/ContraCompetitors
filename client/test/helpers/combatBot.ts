import type { Action } from '../../src/engine/input.ts';
import { STEP_MS } from '../../src/engine/loop.ts';
import type { World } from '../../src/game/world.ts';

export interface BotMemo {
  waited: number;
}

export interface BotDecision {
  held: Action[];
  presses: Action[];
}

/**
 * Simple combat bot: holds fire, waits up to 1.5 s while a live enemy is close ahead, otherwise runs
 * right, jumps when blocked and jumps over incoming enemy bullets. A proxy for pacing, not a
 * replacement for a human playtest.
 *
 * Self-contained (only type imports) so E2E can send its source into the page.
 */
export function decide(world: World, memo: BotMemo): BotDecision {
  const b = world.player.body;
  const px = world.player.centerX;
  const threat = world.enemies.some(
    (e) =>
      e.alive &&
      e.centerX > px &&
      e.centerX - px < 150 &&
      Math.abs(e.body.y + e.body.h - (b.y + b.h)) < 40,
  );
  memo.waited = threat ? memo.waited + 1 : 0;
  const move = !threat || world.lives.invulnerable || memo.waited > 90;
  const incoming = world.projectiles.some(
    (p) =>
      p.alive &&
      p.owner === 'enemy' &&
      Math.abs(p.x - px) < 46 &&
      Math.sign(px - p.x) === Math.sign(p.vx) &&
      p.y > b.y - 4 &&
      p.y < b.y + b.h + 4,
  );
  const jump = b.grounded && ((move && b.blockedRight) || incoming);
  const held: Action[] = move ? ['fire', 'right'] : ['fire'];
  const presses: Action[] = world.timer.state === 'waiting' ? ['right'] : jump ? ['jump'] : [];
  return { held, presses };
}

export function combatRun(world: World, maxSteps = 60 * 400) {
  let restarts = 0;
  let livesLost = 0;
  const memo: BotMemo = { waited: 0 };
  world.takeEvents();
  let steps = 0;
  while (!world.finished && steps < maxSteps) {
    const d = decide(world, memo);
    world.step((a) => d.held.includes(a), d.presses);
    world.frame(STEP_MS);
    for (const ev of world.takeEvents()) {
      if (ev.type === 'restart') restarts++;
      if (ev.type === 'life-lost') livesLost++;
    }
    steps++;
  }
  return { finished: world.finished, seconds: world.timer.ms / 1000, restarts, livesLost };
}
