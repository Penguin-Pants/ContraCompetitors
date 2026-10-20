/** Art pixels per 60 Hz step. */
export const RUN_SPEED = 1.5;
export const GRAVITY = 0.35;
export const JUMP_SPEED = 6.4;
export const MAX_FALL = 7;
/** Steps that one-way platforms are ignored after S (drop). */
export const DROP_STEPS = 12;

export function applyGravity(vy: number): number {
  return Math.min(MAX_FALL, vy + GRAVITY);
}
