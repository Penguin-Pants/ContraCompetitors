export const START_LIVES = 3;
/** About 1.5 s of invulnerability after a hit (LIV-1). */
export const INVULN_STEPS = 90;

export type HitResult = 'ignored' | 'lost-life' | 'game-over';

export class Lives {
  count = START_LIVES;
  invulnSteps = 0;

  get invulnerable(): boolean {
    return this.invulnSteps > 0;
  }

  /** One hit costs one life unless invulnerable. 'game-over' means the level must restart (LIV-3). */
  hit(): HitResult {
    if (this.invulnerable) return 'ignored';
    this.count--;
    if (this.count <= 0) return 'game-over';
    this.invulnSteps = INVULN_STEPS;
    return 'lost-life';
  }

  tick() {
    if (this.invulnSteps > 0) this.invulnSteps--;
  }

  reset() {
    this.count = START_LIVES;
    this.invulnSteps = 0;
  }
}
