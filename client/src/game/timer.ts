export type TimerState = 'waiting' | 'running' | 'stopped';

/** Run timer (LIV-6, Q-4). Waits for the first gameplay key, adds real unpaused time, stops at the exit. */
export class RunTimer {
  state: TimerState = 'waiting';
  ms = 0;

  start() {
    if (this.state === 'waiting') this.state = 'running';
  }

  add(realMs: number) {
    if (this.state === 'running') this.ms += realMs;
  }

  stop() {
    if (this.state === 'running') this.state = 'stopped';
  }

  /** Back to the waiting state at 0 (restart). */
  reset() {
    this.state = 'waiting';
    this.ms = 0;
  }

  /** Integer milliseconds, as reported to the leaderboard. */
  get timeMs(): number {
    return Math.floor(this.ms);
  }
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}
