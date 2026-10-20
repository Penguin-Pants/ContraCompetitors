import type { Particles } from './particles.ts';

const FIRE = ['#fff3b0', '#ffd166', '#f4a259', '#e76f51'];

/** Pixel burst. `power` 1 for a bullet impact, 3 for a defeat. */
export function spawnExplosion(fx: Particles, x: number, y: number, power = 1) {
  const n = 6 * power;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + fx.rand() * 0.4;
    const s = (0.6 + fx.rand()) * (0.6 + power * 0.35);
    fx.add({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 8 + Math.floor(fx.rand() * 6 * power),
      color: FIRE[i % FIRE.length]!,
      gravity: 0.02,
      size: power > 1 && i % 3 === 0 ? 2 : 1,
    });
  }
}
