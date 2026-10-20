export const STEP_MS = 1000 / 60;
/** Largest real frame delta that is simulated. Longer gaps (tab switch, debugger) are dropped. */
export const MAX_FRAME_MS = 250;

export interface LoopHandlers {
  /** Fixed 60 Hz simulation step. */
  update(stepMs: number): void;
  /** Real elapsed time of a frame that was not frozen. The run timer uses this. */
  frame(realMs: number): void;
  render(): void;
  isFrozen(): boolean;
}

export class Loop {
  private acc = 0;
  private last: number | null = null;
  private raf = 0;
  /** In manual mode only `tick()` advances time. E2E tests use this for a deterministic clock. */
  manual = false;

  private readonly h: LoopHandlers;

  constructor(handlers: LoopHandlers) {
    this.h = handlers;
  }

  start() {
    const onFrame = (now: number) => {
      const dt = this.last === null ? 0 : now - this.last;
      this.last = now;
      if (this.manual) this.h.render();
      else this.tick(dt);
      this.raf = requestAnimationFrame(onFrame);
    };
    this.raf = requestAnimationFrame(onFrame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.last = null;
  }

  tick(realMs: number) {
    const dt = Math.min(Math.max(0, realMs), MAX_FRAME_MS);
    if (this.h.isFrozen()) {
      this.acc = 0;
    } else {
      this.acc += dt;
      while (this.acc >= STEP_MS) {
        this.h.update(STEP_MS);
        this.acc -= STEP_MS;
        if (this.h.isFrozen()) {
          this.acc = 0;
          break;
        }
      }
      if (!this.h.isFrozen()) this.h.frame(dt);
    }
    this.h.render();
  }
}
