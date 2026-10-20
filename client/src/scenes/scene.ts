import type { Input } from '../engine/input.ts';
import type { Layers } from '../render/layers.ts';
import type { PixelCanvas } from '../render/pixelCanvas.ts';

export interface SceneContext {
  layers: Layers;
  pixels: PixelCanvas;
  input: Input;
}

export interface Scene {
  update(stepMs: number): void;
  frame(realMs: number): void;
  render(): void;
  /** True while the scene itself is paused. The narrow guard freezes on top of this. */
  paused(): boolean;
  state(): unknown;
  /** The game world, for the E2E hook. */
  world?(): unknown;
  dispose?(): void;
}
