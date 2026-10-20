import path from 'node:path';
import * as ort from 'onnxruntime-node';

/** Face detection model only. No recognition model ships with the app (SEC-4). */
export const MODEL_PATH = path.resolve(
  import.meta.dirname,
  '../../models/face_detection_yunet_2026may.onnx',
);

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

/** Raw RGB pixels, 3 bytes per pixel. */
export interface RgbImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Detector {
  /**
   * Boxes in `img` pixels. `scale` is source pixels per `img` pixel (the image was downscaled for
   * detection), so the minimum face width is checked in source pixels.
   */
  detect(img: RgbImage, scale?: number): Promise<FaceBox[]>;
}

export interface DetectorOptions {
  scoreThreshold: number;
  nmsThreshold: number;
  /** Smallest face width in source pixels. */
  minFaceWidth: number;
}

export const DEFAULT_DETECTOR_OPTIONS: DetectorOptions = {
  scoreThreshold: 0.8,
  nmsThreshold: 0.3,
  minFaceWidth: 40,
};

const STRIDES = [8, 16, 32] as const;
const DIVISOR = 32;

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

export function nms(boxes: FaceBox[], threshold: number): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: FaceBox[] = [];
  for (const b of sorted) if (keep.every((k) => iou(k, b) <= threshold)) keep.push(b);
  return keep;
}

/**
 * Decodes YuNet heads (OpenCV FaceDetectorYN post-processing): score = sqrt(cls * obj), box center
 * is (col + dx, row + dy) * stride, size is exp(dw|dh) * stride.
 */
export function decodeYunet(
  out: Record<string, { data: ArrayLike<number> }>,
  padW: number,
  padH: number,
  threshold: number,
): FaceBox[] {
  const boxes: FaceBox[] = [];
  for (const s of STRIDES) {
    const cols = padW / s;
    const rows = padH / s;
    const cls = out[`cls_${s}`]!.data;
    const obj = out[`obj_${s}`]!.data;
    const bbox = out[`bbox_${s}`]!.data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const clsScore = Math.min(1, Math.max(0, cls[i]!));
        const objScore = Math.min(1, Math.max(0, obj[i]!));
        const score = Math.sqrt(clsScore * objScore);
        if (score < threshold) continue;
        const cx = (c + bbox[i * 4]!) * s;
        const cy = (r + bbox[i * 4 + 1]!) * s;
        const w = Math.exp(bbox[i * 4 + 2]!) * s;
        const h = Math.exp(bbox[i * 4 + 3]!) * s;
        boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h, score });
      }
    }
  }
  return boxes;
}

/** YuNet via ONNX Runtime (CPU). Input is BGR float32 0-255, padded to a multiple of 32. */
export async function createYunetDetector(
  modelPath: string = MODEL_PATH,
  opts: DetectorOptions = DEFAULT_DETECTOR_OPTIONS,
): Promise<Detector> {
  const session = await ort.InferenceSession.create(modelPath, {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
  });
  return {
    async detect(img: RgbImage, scale = 1): Promise<FaceBox[]> {
      const padW = Math.ceil(img.width / DIVISOR) * DIVISOR;
      const padH = Math.ceil(img.height / DIVISOR) * DIVISOR;
      const plane = padW * padH;
      const input = new Float32Array(3 * plane);
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const si = (y * img.width + x) * 3;
          const di = y * padW + x;
          input[di] = img.data[si + 2]!;
          input[plane + di] = img.data[si + 1]!;
          input[2 * plane + di] = img.data[si]!;
        }
      }
      const out = await session.run({
        input: new ort.Tensor('float32', input, [1, 3, padH, padW]),
      });
      const boxes = decodeYunet(out as never, padW, padH, opts.scoreThreshold);
      return nms(boxes, opts.nmsThreshold)
        .map((b) => {
          const x = Math.max(0, b.x);
          const y = Math.max(0, b.y);
          return {
            ...b,
            x,
            y,
            w: Math.min(img.width, b.x + b.w) - x,
            h: Math.min(img.height, b.y + b.h) - y,
          };
        })
        .filter((b) => b.w * scale >= opts.minFaceWidth && b.h > 0);
    },
  };
}
