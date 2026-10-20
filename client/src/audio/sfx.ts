import type { AudioOut } from './audio.ts';

export type SfxName = 'shoot' | 'spread' | 'hit' | 'pop' | 'pickup' | 'jump' | 'lifeLost' | 'exit';

interface Tone {
  type: OscillatorType;
  from: number;
  to: number;
  ms: number;
  gain: number;
  noise?: boolean;
}

/** Synthesized SFX. No audio files, so no third-party asset licenses. */
const TONES: Readonly<Record<SfxName, Tone[]>> = {
  shoot: [{ type: 'square', from: 880, to: 220, ms: 70, gain: 0.25 }],
  spread: [
    { type: 'square', from: 660, to: 180, ms: 90, gain: 0.2 },
    { type: 'sawtooth', from: 990, to: 300, ms: 60, gain: 0.12 },
  ],
  hit: [{ type: 'square', from: 300, to: 120, ms: 50, gain: 0.25 }],
  pop: [
    { type: 'triangle', from: 300, to: 1200, ms: 120, gain: 0.35 },
    { type: 'square', from: 0, to: 0, ms: 140, gain: 0.15, noise: true },
  ],
  pickup: [
    { type: 'square', from: 523, to: 523, ms: 70, gain: 0.2 },
    { type: 'square', from: 784, to: 1046, ms: 120, gain: 0.2 },
  ],
  jump: [{ type: 'square', from: 220, to: 520, ms: 90, gain: 0.15 }],
  lifeLost: [{ type: 'sawtooth', from: 440, to: 60, ms: 420, gain: 0.3 }],
  exit: [
    { type: 'square', from: 523, to: 523, ms: 120, gain: 0.2 },
    { type: 'square', from: 659, to: 659, ms: 120, gain: 0.2 },
    { type: 'square', from: 784, to: 1046, ms: 300, gain: 0.2 },
  ],
};

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

export function playSfx(out: AudioOut, name: SfxName) {
  const { ctx, master } = out;
  if (!ctx || !master || ctx.state !== 'running') return;
  let t = ctx.currentTime;
  for (const tone of TONES[name]) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(tone.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + tone.ms / 1000);
    g.connect(master);
    if (tone.noise) {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      src.connect(g);
      src.start(t);
      src.stop(t + tone.ms / 1000);
    } else {
      const osc = ctx.createOscillator();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), t + tone.ms / 1000);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + tone.ms / 1000);
    }
    if (name === 'exit' || name === 'pickup') t += tone.ms / 1000;
  }
}

/** Laser loop: a buzzing pair of detuned saws while the beam is on. */
export class LaserLoop {
  private nodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

  start(out: AudioOut) {
    const { ctx, master } = out;
    if (this.nodes || !ctx || !master) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(master);
    const oscs = [110, 113.5].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    this.nodes = { oscs, gain };
  }

  stop() {
    if (!this.nodes) return;
    for (const o of this.nodes.oscs) o.stop();
    this.nodes.gain.disconnect();
    this.nodes = null;
  }
}
