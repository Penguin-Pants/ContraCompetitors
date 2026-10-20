import type { Action } from '../engine/input.ts';
import { makeBody, moveBody, type Body } from '../engine/collision.ts';
import { applyGravity, DROP_STEPS, JUMP_SPEED, RUN_SPEED } from '../engine/physics.ts';
import type { TileMap } from '../level/tilemap.ts';

export const PLAYER_W = 12;
export const PLAYER_H = 30;

export class Player {
  readonly body: Body;
  facing: 1 | -1 = 1;
  private dropSteps = 0;

  /** (x, y) is the bottom center (feet). */
  constructor(x: number, y: number) {
    this.body = makeBody(x - PLAYER_W / 2, y - PLAYER_H, PLAYER_W, PLAYER_H);
  }

  /** Returns true when the player jumped this step. */
  update(held: (a: Action) => boolean, presses: readonly Action[], map: TileMap): boolean {
    const b = this.body;
    const dir = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    b.vx = dir * RUN_SPEED;
    if (dir !== 0) this.facing = dir as 1 | -1;
    const jumped = presses.includes('jump') && b.grounded;
    if (jumped) b.vy = -JUMP_SPEED;
    if (presses.includes('drop') && b.grounded && b.onOneWay) this.dropSteps = DROP_STEPS;
    b.vy = applyGravity(b.vy);
    moveBody(b, map, this.dropSteps > 0);
    if (this.dropSteps > 0) this.dropSteps--;
    return jumped;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  get centerY(): number {
    return this.body.y + this.body.h / 2;
  }

  /** Gun muzzle in world pixels. */
  get muzzle(): { x: number; y: number } {
    return { x: this.centerX + this.facing * 8, y: this.body.y + 13 };
  }
}
