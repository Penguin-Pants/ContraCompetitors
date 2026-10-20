import { K_MAX, L1_H, L1_W } from '@lr/shared/render';

export interface StageScale {
  /** Integer CSS pixels per L1 pixel. */
  k: number;
  /** True when the viewport is too narrow to play (E-12). */
  narrow: boolean;
}

export function computeScale(viewportW: number, viewportH: number): StageScale {
  const fit = Math.floor(Math.min(viewportW / L1_W, viewportH / L1_H));
  return { k: Math.min(K_MAX, Math.max(1, fit)), narrow: viewportW < L1_W };
}
