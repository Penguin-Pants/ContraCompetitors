import { Worker } from 'node:worker_threads';
import type { FaceCrop } from './crop.ts';
import type { WorkerJob, WorkerReply } from './worker.ts';

export class PoolTimeout extends Error {}
export class PoolRejected extends Error {}

interface Pending {
  job: WorkerJob;
  timeoutMs: number;
  signal?: AbortSignal;
  resolve: (crops: FaceCrop[]) => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  ready: Promise<void>;
  busy: Pending | null;
  timer: NodeJS.Timeout | null;
}

export interface PoolOptions {
  size?: number;
  /** Test-only: worker detector delay. */
  testDetectDelayMs?: number;
}

const WORKER_URL = new URL('./worker.ts', import.meta.url);

/**
 * Decode, detection and cropping run in worker threads (2 by default). Each job gets the time
 * left in the ingestion budget. On timeout the worker is terminated and replaced, so slow work
 * cannot keep using CPU past the deadline.
 */
export class FacePool {
  private readonly slots: Slot[] = [];
  private readonly queue: Pending[] = [];
  private readonly opts: PoolOptions;
  private nextId = 1;
  private closed = false;
  /** Workers started over the pool's life. Tests read this to see a replacement. */
  started = 0;

  constructor(opts: PoolOptions = {}) {
    this.opts = opts;
    for (let i = 0; i < (opts.size ?? 2); i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    this.started++;
    const worker = new Worker(WORKER_URL, {
      workerData: { testDetectDelayMs: this.opts.testDetectDelayMs },
    });
    const slot: Slot = { worker, busy: null, timer: null, ready: Promise.resolve() };
    slot.ready = new Promise((resolve, reject) => {
      const onMsg = (m: { ready?: boolean }) => {
        if (m.ready) {
          worker.off('message', onMsg);
          resolve();
        }
      };
      worker.on('message', onMsg);
      worker.once('error', reject);
    });
    worker.on('message', (m: WorkerReply | { ready: true }) => {
      if ('ready' in m) return;
      this.finish(slot, m);
    });
    worker.on('error', (err) => this.fail(slot, err));
    worker.unref();
    return slot;
  }

  private finish(slot: Slot, reply: WorkerReply) {
    const p = slot.busy;
    if (!p || p.job.id !== reply.id) return;
    if (slot.timer) clearTimeout(slot.timer);
    slot.busy = null;
    slot.timer = null;
    if (reply.ok) {
      p.resolve(reply.crops.map((c) => ({ ...c, png: Buffer.from(c.png) })));
    } else {
      p.reject(reply.rejected ? new PoolRejected(reply.message) : new Error(reply.message));
    }
    this.pump();
  }

  private fail(slot: Slot, err: Error) {
    const p = slot.busy;
    this.replace(slot);
    p?.reject(err);
    this.pump();
  }

  private replace(slot: Slot) {
    if (slot.timer) clearTimeout(slot.timer);
    void slot.worker.terminate();
    const i = this.slots.indexOf(slot);
    if (i >= 0 && !this.closed) this.slots[i] = this.spawn();
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const next = this.queue.shift();
      if (!next) return;
      slot.busy = next;
      slot.timer = setTimeout(() => {
        if (slot.busy !== next) return;
        slot.busy = null;
        this.replace(slot);
        next.reject(new PoolTimeout('face job deadline'));
        this.pump();
      }, next.timeoutMs);
      void slot.ready.then(() => slot.worker.postMessage(next.job));
    }
  }

  /**
   * Runs one image. Rejects with PoolTimeout at `timeoutMs` and PoolRejected for invalid images.
   * When `signal` aborts, a queued job is dropped and a running job's worker is terminated.
   */
  process(bytes: Uint8Array, timeoutMs: number, signal?: AbortSignal): Promise<FaceCrop[]> {
    if (this.closed) return Promise.reject(new Error('pool closed'));
    if (timeoutMs <= 0 || signal?.aborted) return Promise.reject(new PoolTimeout('no time left'));
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        job: { id: this.nextId++, bytes },
        timeoutMs,
        signal,
        resolve,
        reject,
      };
      signal?.addEventListener('abort', () => this.cancel(pending), { once: true });
      this.queue.push(pending);
      this.pump();
    });
  }

  private cancel(p: Pending) {
    const queued = this.queue.indexOf(p);
    if (queued >= 0) this.queue.splice(queued, 1);
    const slot = this.slots.find((s) => s.busy === p);
    if (slot) {
      slot.busy = null;
      this.replace(slot);
    }
    if (queued >= 0 || slot) {
      p.reject(new PoolTimeout('ingestion deadline'));
      // After every abort listener of this signal has run, so no aborted job starts.
      queueMicrotask(() => this.pump());
    }
  }

  /** Drops queued jobs that have not started (deadline passed for the caller). */
  async close() {
    this.closed = true;
    for (const p of this.queue.splice(0)) p.reject(new Error('pool closed'));
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }
}
