import { DPR_MAX, L1_H, L1_W } from '@lr/shared/render';
import { computeScale, type StageScale } from './scale.ts';

/**
 * The 4-layer stack (build plan 1.2), bottom to top:
 * L0 background (device res), L1 pixel art (960 x 540, integer upscale),
 * L2 Smooth faces (device res), L3 DOM UI.
 */
export interface Layers {
  root: HTMLDivElement;
  bg: HTMLCanvasElement;
  pixel: HTMLCanvasElement;
  face: HTMLCanvasElement;
  ui: HTMLDivElement;
  scale: StageScale;
  /** Backing-store device pixel ratio used by L0 and L2, capped at DPR_MAX. */
  dpr: number;
  /** CSS size of the stage. */
  cssW: number;
  cssH: number;
}

function layerCanvas(name: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = `layer layer-${name}`;
  c.dataset.layer = name;
  return c;
}

export function createLayers(container: HTMLElement): Layers {
  const root = document.createElement('div');
  root.className = 'stage';
  const bg = layerCanvas('bg');
  const pixel = layerCanvas('pixel');
  const face = layerCanvas('face');
  const ui = document.createElement('div');
  ui.className = 'layer layer-ui';
  ui.dataset.layer = 'ui';
  pixel.width = L1_W;
  pixel.height = L1_H;
  root.append(bg, pixel, face, ui);
  container.append(root);
  const layers: Layers = {
    root,
    bg,
    pixel,
    face,
    ui,
    scale: { k: 1, narrow: false },
    dpr: 1,
    cssW: L1_W,
    cssH: L1_H,
  };
  layoutLayers(layers, window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  return layers;
}

/** Applies the integer scale `k` and the capped DPR. */
export function layoutLayers(
  layers: Layers,
  viewportW: number,
  viewportH: number,
  devicePixelRatio: number,
) {
  const scale = computeScale(viewportW, viewportH);
  const dpr = Math.min(DPR_MAX, devicePixelRatio);
  const cssW = L1_W * scale.k;
  const cssH = L1_H * scale.k;
  layers.scale = scale;
  layers.dpr = dpr;
  layers.cssW = cssW;
  layers.cssH = cssH;
  const { root } = layers;
  root.style.width = `${cssW}px`;
  root.style.height = `${cssH}px`;
  root.style.left = `${Math.max(0, Math.floor((viewportW - cssW) / 2))}px`;
  root.style.top = `${Math.max(0, Math.floor((viewportH - cssH) / 2))}px`;
  root.style.setProperty('--k', String(scale.k));
  for (const c of [layers.bg, layers.face]) {
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }
}
