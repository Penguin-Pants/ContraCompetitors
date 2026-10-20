/** Art grid size in art pixels (16:9). */
export const ART_W = 480;
export const ART_H = 270;
/** L1 pixels per art pixel. L1 is ART_W * PIXEL_SCALE by ART_H * PIXEL_SCALE. */
export const PIXEL_SCALE = 2;
export const L1_W = ART_W * PIXEL_SCALE;
export const L1_H = ART_H * PIXEL_SCALE;
/** Largest integer upscale of L1 to CSS pixels. */
export const K_MAX = 4;
/** Largest backing-store device pixel ratio for the high-res layers (L0, L2). */
export const DPR_MAX = 2;
/** Width of an enemy head in art pixels. */
export const HEAD_W_ART = 32;
/** Widest reachable on-screen head in device pixels. Server face crops are capped to this width. */
export const MAX_CROP_PX = HEAD_W_ART * PIXEL_SCALE * K_MAX * DPR_MAX;
