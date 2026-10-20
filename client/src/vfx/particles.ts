export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  gravity: number;
  /** Side length in art pixels. */
  size: number;
}

/** Pixel particles on L1. Updated by the world step, so pause freezes them. */
export class Particles {
  readonly list: Particle[] = [];
  private seed = 1;

  /** Small deterministic PRNG, so scripted runs repeat exactly. */
  rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  add(p: Particle) {
    if (this.list.length < 600) this.list.push(p);
  }

  update() {
    let w = 0;
    for (const p of this.list) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
      if (p.life > 0) this.list[w++] = p;
    }
    this.list.length = w;
  }

  clear() {
    this.list.length = 0;
  }
}
