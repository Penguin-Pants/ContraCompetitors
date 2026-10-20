export type MinuteTask = () => void;

/** Runs registered maintenance tasks once a minute (rate-event prune, cache sweep). */
export class MinuteJob {
  private readonly tasks: { name: string; run: MinuteTask }[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly onError: (name: string, err: unknown) => void;

  constructor(onError: (name: string, err: unknown) => void) {
    this.onError = onError;
  }

  register(name: string, run: MinuteTask) {
    this.tasks.push({ name, run });
  }

  /** Runs every task once. Tests call this instead of waiting a minute. */
  runOnce() {
    for (const t of this.tasks) {
      try {
        t.run();
      } catch (err) {
        this.onError(t.name, err);
      }
    }
  }

  start(intervalMs = 60_000) {
    this.timer ??= setInterval(() => this.runOnce(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
