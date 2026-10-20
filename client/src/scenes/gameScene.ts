import type { Difficulty } from '@lr/shared/difficulty';
import { animationFrame } from '../assets/manifest.ts';
import { WEAPON_NAMES } from '../game/weapons.ts';
import { World } from '../game/world.ts';
import { buildLevel } from '../level/levelData.ts';
import { drawFar, drawLevel } from '../level/tilesDraw.ts';
import { drawBackground } from '../render/background.ts';
import { NEUTRAL_THEME, type Theme } from '../theme/palette.ts';
import { Hud } from '../ui/hud.ts';
import { PauseMenu } from '../ui/pause.ts';
import { EntityRenderer, type GameSheets } from './gameRender.ts';
import type { Scene, SceneContext } from './scene.ts';

export interface GameOptions {
  sheets: GameSheets;
  difficulty?: Difficulty;
  theme?: Theme;
}

export function createGameScene(ctx: SceneContext, opts: GameOptions): Scene {
  const theme = opts.theme ?? NEUTRAL_THEME;
  const world = new World(buildLevel(), opts.difficulty ?? 'medium');
  const hud = new Hud(ctx.layers.ui);
  const pause = new PauseMenu(ctx.layers.ui);
  const entities = new EntityRenderer(opts.sheets);
  let animMs = 0;
  let steps = 0;

  const resume = () => {
    pause.hide();
    ctx.input.takePresses();
  };
  const restart = () => {
    world.restart();
    animMs = 0;
    resume();
  };
  pause.setItems([
    { label: 'Resume', action: resume },
    { label: 'Restart level', action: restart },
  ]);
  const offPause = ctx.input.onPress((a) => {
    if (a !== 'pause' || world.finished) return;
    if (pause.open) resume();
    else pause.show();
  });

  const drawPlayer = () => {
    const pl = world.player;
    const b = pl.body;
    if (world.lives.invulnerable && Math.floor(world.lives.invulnSteps / 4) % 2 === 0) return;
    const sheet = opts.sheets.player;
    const anims = sheet.spec.animations;
    const anim = !b.grounded ? anims.jump! : b.vx !== 0 ? anims.run! : anims.idle!;
    const surface = sheet.surfaces[animationFrame(anim, animMs)]!;
    const cam = world.camera;
    ctx.pixels.sprite(
      surface,
      Math.round(b.x) - cam.x - 2,
      Math.round(b.y) - cam.y - 2,
      pl.facing < 0,
    );
  };

  return {
    update(stepMs) {
      world.step((a) => ctx.input.isHeld(a), ctx.input.takePresses());
      world.takeEvents();
      if (world.timer.state !== 'waiting') {
        animMs += stepMs;
        steps++;
      }
    },
    frame(realMs) {
      world.frame(realMs);
    },
    render() {
      const cam = world.camera;
      drawBackground(ctx.layers, cam);
      const p = ctx.pixels;
      p.clear();
      drawFar(p, cam);
      drawLevel(p, world.level, cam, theme);
      entities.pickups(p, world, animMs);
      entities.enemies(p, world, animMs, true);
      drawPlayer();
      entities.projectiles(p, world);
      entities.laser(p, world, steps);
      entities.particles(p, world);
      hud.setTime(world.timer.ms);
      hud.setLives(world.lives.count);
      hud.setWeapon(WEAPON_NAMES[world.weapon]);
    },
    paused: () => pause.open,
    world: () => world,
    state: () => {
      const b = world.player.body;
      return {
        scene: 'game',
        difficulty: world.difficulty,
        player: { x: b.x, y: b.y, grounded: b.grounded, blockedRight: b.blockedRight },
        timer: { state: world.timer.state, ms: world.timer.ms },
        lives: world.lives.count,
        weapon: world.weapon,
        laser: !!world.laser,
        enemies: world.enemies.filter((e) => e.alive).length,
        projectiles: world.projectiles.length,
        particles: world.fx.list.length,
        paused: pause.open,
        finished: world.finished,
      };
    },
    dispose() {
      offPause();
      hud.dispose();
      pause.dispose();
    },
  };
}
