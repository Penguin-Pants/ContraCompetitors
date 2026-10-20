import { makeBody, moveBody, type Body } from '../engine/collision.ts';
import { applyGravity } from '../engine/physics.ts';
import type { TileMap } from '../level/tilemap.ts';
import type { DifficultySettings } from './difficulty.ts';

export type EnemyKind = 'walker' | 'shooter';

export const ENEMY_HP: Readonly<Record<EnemyKind, number>> = { walker: 2, shooter: 3 };
/** Hitbox covers the body and the bobble head. */
export const ENEMY_W = 20;
export const ENEMY_H = 50;
const WALK_SPEED: Readonly<Record<EnemyKind, number>> = { walker: 0.8, shooter: 0.5 };
const NOTICE_RANGE = 320;
const SHOOT_RANGE = 170;
const SHOOT_INTERVAL = 90;
const ENEMY_JUMP = 5.4;
export const ENEMY_BULLET_SPEED = 2.5;
/** Steps a defeated enemy stays on screen for the defeat animation. */
export const DEFEAT_STEPS = 30;
const FLASH_STEPS = 5;

export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class Enemy {
  readonly kind: EnemyKind;
  readonly spawnId: number;
  readonly body: Body;
  hp: number;
  facing: 1 | -1 = -1;
  flashSteps = 0;
  /** Counts up after defeat; the enemy is removed at DEFEAT_STEPS. */
  defeatSteps = -1;
  fireCooldown: number;
  /** Index into the run's face assignment (Phase 5). */
  faceSlot: number;

  constructor(kind: EnemyKind, spawnId: number, x: number, groundY: number, faceSlot = 0) {
    this.kind = kind;
    this.spawnId = spawnId;
    this.body = makeBody(x - ENEMY_W / 2, groundY - ENEMY_H, ENEMY_W, ENEMY_H);
    this.hp = ENEMY_HP[kind];
    this.fireCooldown = SHOOT_INTERVAL / 2;
    this.faceSlot = faceSlot;
  }

  get box(): Body {
    return this.body;
  }

  get alive(): boolean {
    return this.defeatSteps < 0;
  }

  get centerX(): number {
    return this.body.x + this.body.w / 2;
  }

  /** Applies damage. Returns true when this hit defeats the enemy. */
  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashSteps = FLASH_STEPS;
    if (this.hp <= 0) {
      this.defeatSteps = 0;
      return true;
    }
    return false;
  }

  /** One step of AI and physics. Returns a shot when a shooter fires. */
  update(map: TileMap, targetX: number, targetY: number, d: DifficultySettings): EnemyShot | null {
    if (this.flashSteps > 0) this.flashSteps--;
    if (!this.alive) {
      this.defeatSteps++;
      return null;
    }
    const b = this.body;
    const dx = targetX - this.centerX;
    const near = Math.abs(dx) < NOTICE_RANGE;
    if (near) this.facing = dx < 0 ? -1 : 1;
    let shot: EnemyShot | null = null;
    if (this.kind === 'shooter' && near && Math.abs(dx) < SHOOT_RANGE) {
      b.vx = 0;
      if (--this.fireCooldown <= 0) {
        this.fireCooldown = Math.round(SHOOT_INTERVAL * d.fireInterval);
        const sx = this.centerX + this.facing * 10;
        const sy = b.y + 34;
        const len = Math.hypot(targetX - sx, targetY - sy) || 1;
        shot = {
          x: sx,
          y: sy,
          vx: ((targetX - sx) / len) * ENEMY_BULLET_SPEED,
          vy: ((targetY - sy) / len) * ENEMY_BULLET_SPEED,
        };
      }
    } else {
      b.vx = near ? this.facing * WALK_SPEED[this.kind] * d.enemySpeed : 0;
    }
    const wasBlocked = this.facing > 0 ? b.blockedRight : b.blockedLeft;
    if (wasBlocked && b.grounded && b.vx !== 0) b.vy = -ENEMY_JUMP;
    b.vy = applyGravity(b.vy);
    moveBody(b, map, false);
    return shot;
  }
}
