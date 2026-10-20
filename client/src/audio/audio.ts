/**
 * Web Audio output with one master gain (DEL-4). The context starts on the first key press
 * (browser autoplay rule). Sound state lives in memory for the visit; default on (build plan 4.1).
 */
export class AudioOut {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private on = true;
  /** True while the game is paused; `unlock()` must not resume audio then. */
  private held = false;
  static readonly VOLUME = 0.35;

  /** Creates or resumes the context. Call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? AudioOut.VOLUME : 0;
      this.master.connect(this.ctx.destination);
    }
    if (!this.held && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(on: boolean) {
    this.on = on;
    if (this.master) this.master.gain.value = on ? AudioOut.VOLUME : 0;
  }

  /** Current master gain, or null before the context exists. */
  get gain(): number | null {
    return this.master ? this.master.gain.value : null;
  }

  /** Pause freezes audio scheduling. */
  suspend() {
    this.held = true;
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume() {
    this.held = false;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }
}
