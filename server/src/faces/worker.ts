import { createYunetDetector, type Detector } from './detector.ts';
import { ImageRejected, processImage } from './crop.ts';

export interface WorkerJob {
  id: number;
  bytes: Uint8Array;
}

export type WorkerReply =
  | {
      id: number;
      ok: true;
      crops: { id: string; png: Uint8Array; width: number; height: number }[];
    }
  | { id: number; ok: false; rejected: boolean; message: string };

/** Test-only: a detector that never answers in time. Set through the pool, never through env. */
interface TestWorkerData {
  testDetectDelayMs?: number;
}

/** Child process of FacePool (pool.ts). Test options arrive as JSON in argv. */
const data = JSON.parse(process.argv[2] ?? '{}') as TestWorkerData;
// The pool is gone: stop, so no orphan keeps the model in memory.
process.on('disconnect', () => process.exit(0));
const real = await createYunetDetector();
const detector: Detector = data.testDetectDelayMs
  ? {
      detect: async (img) => {
        await new Promise((r) => setTimeout(r, data.testDetectDelayMs));
        return real.detect(img);
      },
    }
  : real;

process.on('message', async (job: WorkerJob) => {
  let reply: WorkerReply;
  try {
    const crops = await processImage(job.bytes, detector);
    reply = { id: job.id, ok: true, crops };
  } catch (err) {
    reply = {
      id: job.id,
      ok: false,
      rejected: err instanceof ImageRejected,
      message: (err as Error).message,
    };
  }
  process.send!(reply);
});
process.send!({ ready: true });
