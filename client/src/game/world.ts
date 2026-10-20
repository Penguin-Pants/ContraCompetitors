import { ART_H, ART_W } from '@lr/shared/render';
import type { Difficulty } from '@lr/shared/difficulty';
import { GAMEPLAY_ACTIONS, type Action } from '../engine/input.ts';
import { overlaps } from '../engine/collision.ts';
import type { Level } from '../level/levelData.ts';
import { Camera } from '../render/camera.ts';
import { spawnExplosion } from '../vfx/explosions.ts';
import { spawnGore } from '../vfx/gore.ts';
import { Particles } from '../vfx/particles.ts';
import { DIFFICULTY_TABLE, type DifficultySettings } from './difficulty.ts';
import { DEFEAT_STEPS, Enemy } from './enemies.ts';
import { Lives } from './lives.ts';
import { collect, type Pickup } from './pickups.ts';
import { Player } from './player.ts';
import {
  makeProjectile,
  projectileBox,
  updateProjectiles,
  type Projectile,
} from './projectiles.ts';
import { ACTIVATE_AHEAD, activeSpawns, GROUP_GAP } from './spawn.ts';
import { RunTimer } from './timer.ts';
import {
  BULLET_DAMAGE,
  FIRE_COOLDOWN,
  LASER_DPS,
  laserEnd,
  laserTargets,
  pistolVelocity,
  spreadVelocities,
  type WeaponKind,
} from './weapons.ts';

export type WorldEvent =
  | { type: 'shoot' | 'spread' | 'jump' | 'life-lost' | 'restart' | 'exit' }
  | { type: 'pickup'; weapon: WeaponKind }
  | { type: 'hit' | 'defeat'; enemy: Enemy }
  | { type: 'laser'; on: boolean };

export interface LaserBeam {
  x: number;
  y: number;
  end: number;
}

/** DOM-free game state. Scenes render it; tests drive it directly. */
export class World {
  readonly level: Level;
  readonly difficulty: Difficulty;
  readonly settings: DifficultySettings;
  readonly timer = new RunTimer();
  readonly lives = new Lives();
  readonly camera: Camera;
  readonly fx = new Particles();
  private readonly active: Set<number>;
  player!: Player;
  weapon: WeaponKind = 'pistol';
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  laser: LaserBeam | null = null;
  finished = false;
  /** Events since the last `takeEvents()`, for audio and face VFX. */
  private events: WorldEvent[] = [];
  private spawned = new Set<number>();
  private cooldown = 0;
  private gameOver = false;
  /** Face slot for the next enemy (Phase 5 assigns one face per slot). */
  private nextSlot = 0;

  constructor(level: Level, difficulty: Difficulty = 'medium') {
    this.level = level;
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_TABLE[difficulty];
    this.active = activeSpawns(level.spawns, this.settings.activeSpawns);
    this.camera = new Camera(level.map.widthPx, ART_H);
    this.resetLevel();
  }

  get activeSpawnCount(): number {
    return this.active.size;
  }

  takeEvents(): WorldEvent[] {
    return this.events.splice(0);
  }

  /** One fixed step. The world holds still until the first gameplay key (Q-4). */
  step(held: (a: Action) => boolean, presses: readonly Action[]) {
    if (this.finished) return;
    if (this.timer.state === 'waiting') {
      if (!presses.some((a) => GAMEPLAY_ACTIONS.has(a))) return;
      this.timer.start();
    }
    const map = this.level.map;
    if (this.player.update(held, presses, map)) this.events.push({ type: 'jump' });
    this.camera.follow(this.player.centerX, this.player.centerY);
    this.activateSpawns();
    this.fire(held('fire'));

    const target = { x: this.player.centerX, y: this.player.centerY };
    for (const e of this.enemies) {
      const shot = e.update(map, target.x, target.y, this.settings);
      if (shot) this.projectiles.push(makeProjectile(shot.x, shot.y, shot.vx, shot.vy, 'enemy', 1));
    }

    for (const hit of updateProjectiles(this.projectiles, map, this.camera.x, ART_W)) {
      spawnExplosion(this.fx, hit.x, hit.y, 1);
    }
    this.resolveProjectiles();
    this.resolveLaser();
    this.resolveContact();
    if (this.gameOver) {
      this.restart();
      return;
    }

    const got = collect(this.pickups, this.player.body);
    if (got) {
      this.weapon = got.weapon;
      this.events.push({ type: 'pickup', weapon: got.weapon });
    }

    this.lives.tick();
    this.fx.update();
    this.enemies = this.enemies.filter((e) => e.defeatSteps < DEFEAT_STEPS);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    if (overlaps(this.player.body, this.level.exit)) {
      this.timer.stop();
      this.finished = true;
      this.setLaser(null);
      this.events.push({ type: 'exit' });
    }
  }

  /** Real frame time for the timer. */
  frame(realMs: number) {
    this.timer.add(realMs);
  }

  /** Restart level (pause menu or 0 lives): lives 3, timer waiting at 0, enemies and pickups reset. */
  restart() {
    this.resetLevel();
    this.events.push({ type: 'restart' });
  }

  private resetLevel() {
    this.timer.reset();
    this.lives.reset();
    this.finished = false;
    this.gameOver = false;
    this.weapon = 'pistol';
    this.cooldown = 0;
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = this.level.pickups.map((p) => ({ ...p, taken: false }));
    this.spawned = new Set();
    this.nextSlot = 0;
    this.fx.clear();
    this.setLaser(null);
    this.camera.follow(this.player.centerX, this.player.centerY);
  }

  private activateSpawns() {
    const edge = this.camera.x + ART_W + ACTIVATE_AHEAD;
    for (const sp of this.level.spawns) {
      if (sp.x > edge || this.spawned.has(sp.id) || !this.active.has(sp.id)) continue;
      this.spawned.add(sp.id);
      for (let i = 0; i < sp.count; i++) {
        this.enemies.push(new Enemy(sp.kind, sp.id, sp.x + i * GROUP_GAP, sp.y, this.nextSlot++));
      }
    }
  }

  private fire(held: boolean) {
    if (this.cooldown > 0) this.cooldown--;
    const pl = this.player;
    if (this.weapon === 'laser') {
      if (!held) return this.setLaser(null);
      const m = pl.muzzle;
      return this.setLaser({ x: m.x, y: m.y, end: laserEnd(this.level.map, m.x, m.y, pl.facing) });
    }
    this.setLaser(null);
    if (!held || this.cooldown > 0) return;
    const m = pl.muzzle;
    const vels =
      this.weapon === 'spread' ? spreadVelocities(pl.facing) : [pistolVelocity(pl.facing)];
    for (const v of vels)
      this.projectiles.push(makeProjectile(m.x, m.y, v.vx, v.vy, 'player', BULLET_DAMAGE));
    this.cooldown = FIRE_COOLDOWN[this.weapon];
    this.events.push({ type: this.weapon === 'spread' ? 'spread' : 'shoot' });
  }

  private setLaser(beam: LaserBeam | null) {
    if (!!beam !== !!this.laser) this.events.push({ type: 'laser', on: !!beam });
    this.laser = beam;
  }

  private damageEnemy(e: Enemy, amount: number) {
    const wasFlashing = e.flashSteps > 0;
    const defeated = e.damage(amount);
    if (defeated) {
      spawnGore(this.fx, e.centerX, e.body.y + 38);
      spawnExplosion(this.fx, e.centerX, e.body.y + 36, 3);
      this.events.push({ type: 'defeat', enemy: e });
    } else if (!wasFlashing) {
      this.events.push({ type: 'hit', enemy: e });
    }
  }

  private resolveProjectiles() {
    for (const p of this.projectiles) {
      if (!p.alive || this.gameOver) continue;
      const box = projectileBox(p);
      if (p.owner === 'player') {
        const e = this.enemies.find((en) => en.alive && overlaps(box, en.box));
        if (e) {
          p.alive = false;
          this.damageEnemy(e, p.damage);
        }
      } else if (overlaps(box, this.player.body)) {
        p.alive = false;
        this.hurtPlayer();
      }
    }
  }

  private resolveLaser() {
    if (!this.laser) return;
    const { x, y, end } = this.laser;
    const perStep = LASER_DPS / 60;
    for (const e of laserTargets(
      this.enemies.filter((en) => en.alive),
      x,
      end,
      y,
    ))
      this.damageEnemy(e, perStep);
  }

  private resolveContact() {
    if (this.gameOver) return;
    if (this.enemies.some((e) => e.alive && overlaps(e.box, this.player.body))) this.hurtPlayer();
  }

  private hurtPlayer() {
    const result = this.lives.hit();
    if (result === 'ignored') return;
    if (result === 'game-over') {
      this.gameOver = true;
      return;
    }
    // Respawn in place (I-4) with invulnerability; weapon back to the pistol (LIV-2).
    this.weapon = 'pistol';
    this.setLaser(null);
    this.events.push({ type: 'life-lost' });
  }
}
