import { GAMEPLAY_ACTIONS, type Action } from '../engine/input.ts';
import { overlaps } from '../engine/collision.ts';
import type { Level } from '../level/levelData.ts';
import { Player } from './player.ts';
import { RunTimer } from './timer.ts';

/** DOM-free game state. Scenes render it; tests drive it directly. */
export class World {
  readonly level: Level;
  readonly timer = new RunTimer();
  player: Player;
  finished = false;

  constructor(level: Level) {
    this.level = level;
    this.player = new Player(level.spawn.x, level.spawn.y);
  }

  /** One fixed step. The world holds still until the first gameplay key (Q-4). */
  step(held: (a: Action) => boolean, presses: readonly Action[]) {
    if (this.finished) return;
    if (this.timer.state === 'waiting') {
      if (!presses.some((a) => GAMEPLAY_ACTIONS.has(a))) return;
      this.timer.start();
    }
    this.player.update(held, presses, this.level.map);
    if (overlaps(this.player.body, this.level.exit)) {
      this.timer.stop();
      this.finished = true;
    }
  }

  /** Real frame time for the timer. */
  frame(realMs: number) {
    this.timer.add(realMs);
  }

  restart() {
    this.timer.reset();
    this.finished = false;
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
  }
}
