import type { FaceDto } from '@lr/shared/api';
import { matchesDomain } from '../net/hostname.ts';

/** Read TTL. With the 1 min sweep, no entry lives longer than 23 h 1 min (C-1: under 24 h). */
export const CACHE_TTL_MS = 23 * 60 * 60 * 1000;
export const CACHE_MAX_BYTES = 256 * 1024 * 1024;

export interface CacheEntry {
  colors: string[];
  faces: FaceDto[];
  /** Canonical host of every page and image fetched for the entry. */
  sourceHosts: ReadonlySet<string>;
  createdAt: number;
}

interface Stored extends CacheEntry {
  bytes: number;
}

/**
 * ING-9, C-1: faces per exact canonical host, in process memory only. Nothing is written to disk,
 * so no face data survives a stop, crash or redeploy. LRU eviction above CACHE_MAX_BYTES.
 */
export class FaceCache {
  private readonly map = new Map<string, Stored>();
  private bytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes = CACHE_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  get size(): number {
    return this.map.size;
  }

  get totalBytes(): number {
    return this.bytes;
  }

  get(key: string, now: number): CacheEntry | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (now - e.createdAt >= CACHE_TTL_MS) {
      this.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, e);
    return e;
  }

  set(key: string, entry: CacheEntry) {
    this.delete(key);
    const bytes = entry.faces.reduce((n, f) => n + f.dataUrl.length, 0) + 1024;
    if (bytes > this.maxBytes) return;
    this.map.set(key, { ...entry, bytes });
    this.bytes += bytes;
    for (const [k] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.delete(k);
    }
  }

  private delete(key: string) {
    const e = this.map.get(key);
    if (!e) return;
    this.bytes -= e.bytes;
    this.map.delete(key);
  }

  /**
   * Deletes every entry whose key or any source host equals `entry` or ends with `.` + `entry`
   * (the blocklist matching rule). Returns the number deleted.
   */
  purge(entry: string): number {
    let n = 0;
    for (const [k, e] of this.map) {
      if (matchesDomain(k, entry) || [...e.sourceHosts].some((h) => matchesDomain(h, entry))) {
        this.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Drops entries older than the TTL. */
  expire(now: number): number {
    let n = 0;
    for (const [k, e] of this.map) {
      if (now - e.createdAt >= CACHE_TTL_MS) {
        this.delete(k);
        n++;
      }
    }
    return n;
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  /** Age of every entry at `now`, without touching LRU order or expiry. */
  ages(now: number): number[] {
    return [...this.map.values()].map((e) => now - e.createdAt);
  }
}
