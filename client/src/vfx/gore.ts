import type { Particles } from './particles.ts';

const GORE = ['#8c1d1d', '#b02a2a', '#5e1212'];

/** Light gore: a few droplets from the body on defeat (ENM-2). */
export function spawnGore(fx: Particles, x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    fx.add({
      x: x + (fx.rand() - 0.5) * 10,
      y: y + (fx.rand() - 0.5) * 8,
      vx: (fx.rand() - 0.5) * 2.4,
      vy: -fx.rand() * 2.6,
      life: 22 + Math.floor(fx.rand() * 14),
      color: GORE[i % GORE.length]!,
      gravity: 0.18,
      size: 1,
    });
  }
}
