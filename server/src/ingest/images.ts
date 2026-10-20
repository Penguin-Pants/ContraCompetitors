import type { FaceCrop } from '../faces/crop.ts';
import type { ImageCandidate } from './crawl.ts';

export const MAX_IMAGE_CANDIDATES = 150;
export const IMAGE_CONCURRENCY = 4;
/** Max faces per domain. */
export const MAX_FACES = 30;

/** Distinct candidates kept per priority while crawling. `prioritize` later takes the best 150. */
export const CANDIDATES_PER_PRIORITY = 500;

/**
 * Image candidates collected while crawling: deduped (a repeat keeps its highest priority) and
 * capped per priority as they arrive, so a page full of images cannot grow memory without end
 * or push out team and author images.
 */
export class CandidateSet {
  private readonly byUrl = new Map<string, number>();
  private readonly counts = new Map<number, number>();

  add(c: ImageCandidate) {
    const prev = this.byUrl.get(c.url);
    if (prev !== undefined && prev >= c.priority) return;
    if ((this.counts.get(c.priority) ?? 0) >= CANDIDATES_PER_PRIORITY) return;
    if (prev !== undefined) this.counts.set(prev, this.counts.get(prev)! - 1);
    this.counts.set(c.priority, (this.counts.get(c.priority) ?? 0) + 1);
    this.byUrl.set(c.url, c.priority);
  }

  get size(): number {
    return this.byUrl.size;
  }

  list(): ImageCandidate[] {
    return [...this.byUrl].map(([url, priority]) => ({ url, priority }));
  }
}

/** Dedupes candidate URLs and keeps at most MAX_IMAGE_CANDIDATES, author and team images first. */
export function prioritize(
  cands: readonly ImageCandidate[],
  tried: ReadonlySet<string> = new Set(),
): string[] {
  const best = new Map<string, number>();
  cands.forEach((c, i) => {
    if (tried.has(c.url)) return;
    const prev = best.get(c.url);
    // Higher priority first, then first seen.
    const score = c.priority * 1e6 - i;
    if (prev === undefined || score > prev) best.set(c.url, score);
  });
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_IMAGE_CANDIDATES)
    .map(([url]) => url);
}

export interface ImageStage {
  fetchImage(url: string): Promise<{ bytes: Uint8Array; hosts: readonly string[] }>;
  detect(bytes: Uint8Array): Promise<FaceCrop[]>;
}

/** Shared, mutable ingestion result. On the deadline the route reads whatever is in it. */
export interface Accumulator {
  colors: string[];
  faces: Map<string, FaceCrop>;
  sourceHosts: Set<string>;
  tried: Set<string>;
  stats: { images: number; discarded: number; pages: number; headless: boolean };
}

export function newAccumulator(): Accumulator {
  return {
    colors: [],
    faces: new Map(),
    sourceHosts: new Set(),
    tried: new Set(),
    stats: { images: 0, discarded: 0, pages: 0, headless: false },
  };
}

/**
 * Fetches images with at most IMAGE_CONCURRENCY in flight and adds face crops to `acc`, deduped
 * by content hash. Invalid, oversized and non-image responses are discarded (E-7).
 */
export async function collectFaces(
  urls: readonly string[],
  stage: ImageStage,
  acc: Accumulator,
  signal: AbortSignal,
) {
  let next = 0;
  const lane = async () => {
    while (next < urls.length && !signal.aborted && acc.faces.size < MAX_FACES) {
      const url = urls[next++]!;
      acc.tried.add(url);
      acc.stats.images++;
      try {
        const { bytes, hosts } = await stage.fetchImage(url);
        if (signal.aborted) return;
        const crops = await stage.detect(bytes);
        for (const h of hosts) acc.sourceHosts.add(h);
        for (const c of crops) if (acc.faces.size < MAX_FACES) acc.faces.set(c.id, c);
      } catch {
        acc.stats.discarded++;
      }
    }
  };
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, lane));
}
