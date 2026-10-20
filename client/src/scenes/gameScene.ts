import { animationFrame } from '../assets/manifest.ts';
import type { LoadedSheet } from '../assets/loader.ts';
import { World } from '../game/world.ts';
import { buildLevel } from '../level/levelData.ts';
import { drawFar, drawLevel } from '../level/tilesDraw.ts';
import { drawBackground } from '../render/background.ts';
import { Camera } from '../render/camera.ts';
import { ART_H } from '@lr/shared/render';
import { NEUTRAL_THEME, type Theme } from '../theme/palette.ts';
import { Hud } from '../ui/hud.ts';
import type { Scene, SceneContext } from './scene.ts';

export interface GameAssets {
  player: LoadedSheet;
}

export function createGameScene(
  ctx: SceneContext,
  assets: GameAssets,
  theme: Theme = NEUTRAL_THEME,
): Scene {
  const world = new World(buildLevel());
  const camera = new Camera(world.level.map.widthPx, ART_H);
  const hud = new Hud(ctx.layers.ui);
  let animMs = 0;

  const drawPlayer = () => {
    const pl = world.player;
    const b = pl.body;
    const sheet = assets.player;
    const anim = !b.grounded
      ? sheet.spec.animations.jump!
      : b.vx !== 0
        ? sheet.spec.animations.run!
        : sheet.spec.animations.idle!;
    const surface = sheet.surfaces[animationFrame(anim, animMs)]!;
    const x = Math.round(b.x) - camera.x - 2;
    const y = Math.round(b.y) - camera.y - 2;
    ctx.pixels.sprite(surface, x, y, pl.facing < 0);
  };

  return {
    update(stepMs) {
      world.step((a) => ctx.input.isHeld(a), ctx.input.takePresses());
      if (world.timer.state !== 'waiting') animMs += stepMs;
    },
    frame(realMs) {
      world.frame(realMs);
    },
    render() {
      camera.follow(world.player.centerX, world.player.centerY);
      drawBackground(ctx.layers, camera);
      const p = ctx.pixels;
      p.clear();
      drawFar(p, camera);
      drawLevel(p, world.level, camera, theme);
      drawPlayer();
      hud.setTime(world.timer.ms);
    },
    paused: () => false,
    state: () => {
      const b = world.player.body;
      return {
        scene: 'game',
        player: { x: b.x, y: b.y, grounded: b.grounded, blockedRight: b.blockedRight },
        timer: { state: world.timer.state, ms: world.timer.ms },
        finished: world.finished,
      };
    },
    dispose() {
      hud.dispose();
    },
  };
}
