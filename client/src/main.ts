import './style.css';
import { installE2EHook } from './dev/e2eHook.ts';
import { Input } from './engine/input.ts';
import { Loop } from './engine/loop.ts';
import { createLayers, layoutLayers } from './render/layers.ts';
import { PixelCanvas } from './render/pixelCanvas.ts';
import type { Scene, SceneContext } from './scenes/scene.ts';
import { createTestScene } from './scenes/testScene.ts';
import { createGameScene } from './scenes/gameScene.ts';
import { loadSheet } from './assets/loader.ts';
import {
  BRIEFCASE_SHEET,
  PLAYER_SHEET,
  SHOOTER_SHEET,
  WALKER_SHEET,
} from './assets/placeholders.ts';
import { isDifficulty } from '@lr/shared/difficulty';
import { NarrowGuard } from './ui/narrowGuard.ts';

const app = document.getElementById('app')!;
const layers = createLayers(app);
const pixels = new PixelCanvas(layers.pixel);
const input = new Input();
input.attach(window);
const guard = new NarrowGuard(document.body);

const relayout = () => {
  layoutLayers(layers, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  guard.update(layers.scale.narrow);
  if (guard.active) input.clear();
};
window.addEventListener('resize', relayout);
relayout();

const ctx: SceneContext = { layers, pixels, input };
const params = new URLSearchParams(location.search);
const difficultyParam = params.get('difficulty');
const scene: Scene =
  params.get('scene') === 'test'
    ? createTestScene(ctx)
    : createGameScene(ctx, {
        sheets: {
          player: await loadSheet(PLAYER_SHEET),
          walker: await loadSheet(WALKER_SHEET),
          shooter: await loadSheet(SHOOTER_SHEET),
          briefcase: await loadSheet(BRIEFCASE_SHEET),
        },
        difficulty: isDifficulty(difficultyParam) ? difficultyParam : 'medium',
      });

const loop = new Loop({
  update: (ms) => scene.update(ms),
  frame: (ms) => scene.frame(ms),
  render: () => scene.render(),
  isFrozen: () => guard.active || scene.paused(),
});
installE2EHook(
  loop,
  () => ({
    k: layers.scale.k,
    narrow: layers.scale.narrow,
    scene: scene.state(),
  }),
  () => scene.world?.(),
);
loop.start();
