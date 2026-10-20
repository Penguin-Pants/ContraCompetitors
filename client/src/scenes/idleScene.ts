import { ART_H } from '@lr/shared/render';
import { buildLevel } from '../level/levelData.ts';
import { drawFar, drawLevel } from '../level/tilesDraw.ts';
import { drawBackground } from '../render/background.ts';
import { Camera } from '../render/camera.ts';
import { NEUTRAL_THEME } from '../theme/palette.ts';
import type { Scene, SceneContext } from './scene.ts';

/** Static level backdrop behind the menus. */
export function createIdleScene(ctx: SceneContext): Scene {
  const level = buildLevel();
  const camera = new Camera(level.map.widthPx, ART_H);
  return {
    update() {},
    frame() {},
    render() {
      drawBackground(ctx.layers, camera);
      ctx.pixels.clear();
      drawFar(ctx.pixels, camera);
      drawLevel(ctx.pixels, level, camera, NEUTRAL_THEME);
    },
    paused: () => true,
    state: () => ({ scene: 'idle' }),
  };
}
