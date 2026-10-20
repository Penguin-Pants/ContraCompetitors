import './style.css';
import { App } from './app.ts';
import { AudioOut } from './audio/audio.ts';
import { installE2EHook } from './dev/e2eHook.ts';
import { Input } from './engine/input.ts';
import { Loop } from './engine/loop.ts';
import { createLayers, layoutLayers } from './render/layers.ts';
import { PixelCanvas } from './render/pixelCanvas.ts';
import type { Scene, SceneContext } from './scenes/scene.ts';
import { createTestScene } from './scenes/testScene.ts';
import { NarrowGuard } from './ui/narrowGuard.ts';

const root = document.getElementById('app')!;
const layers = createLayers(root);
const pixels = new PixelCanvas(layers.pixel);
const input = new Input();
input.attach(window);
const guard = new NarrowGuard(document.body);
const audio = new AudioOut();
// Browsers start audio only after a user gesture.
window.addEventListener('keydown', () => audio.unlock());
window.addEventListener('pointerdown', () => audio.unlock());

const relayout = () => {
  layoutLayers(layers, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  guard.update(layers.scale.narrow);
  input.setBlocked(guard.active);
};
window.addEventListener('resize', relayout);
relayout();

const ctx: SceneContext = { layers, pixels, input };
const params = new URLSearchParams(location.search);
const testScene: Scene | null = params.get('scene') === 'test' ? createTestScene(ctx) : null;
const app = testScene ? null : await App.create(ctx, audio);
const scene = (): Scene => testScene ?? app!.scene;

const loop = new Loop({
  update: (ms) => scene().update(ms),
  frame: (ms) => scene().frame(ms),
  render: () => scene().render(),
  isFrozen: () => guard.active || scene().paused(),
});
installE2EHook(
  loop,
  () => ({ k: layers.scale.k, narrow: layers.scale.narrow, scene: scene().state() }),
  () => scene().world?.(),
);
loop.start();
