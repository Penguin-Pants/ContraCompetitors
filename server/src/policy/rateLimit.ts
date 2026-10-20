import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import type { Db } from '../db/db.ts';

export const HOUR_MS = 60 * 60 * 1000;

/**
 * The rate-limit bucket of an address. IPv4 is the full address (an IPv4-mapped IPv6 address
 * counts as its IPv4 address). IPv6 is its /64: one subscriber usually holds a whole /64, so
 * rotating the low 64 bits must not give new slots.
 */
export function rateKey(ip: string): string {
  if (!ipaddr.isValid(ip)) return ip;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress())
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  if (addr.kind() === 'ipv4') return addr.toString();
  const parts = (addr as ipaddr.IPv6).parts.slice(0, 4);
  return `${new ipaddr.IPv6([...parts, 0, 0, 0, 0]).toString()}/64`;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(rateKey(ip)).digest('hex');
}

/**
 * Sliding-window limit per IP in SQLite, so it survives restarts (ING-8). Stores only a SHA-256
 * of the IP. Each consume prunes that IP's old events; `sweep()` prunes everything older than the
 * window.
 */
export class RateLimiter {
  private readonly db: Db;
  private readonly kind: string;
  readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: () => number;

  constructor(db: Db, kind: string, limit: number, clock: () => number, windowMs = HOUR_MS) {
    this.db = db;
    this.kind = kind;
    this.limit = limit;
    this.clock = clock;
    this.windowMs = windowMs;
  }

  /** Uses one slot. Returns false, and uses nothing, when the IP is at the limit. */
  tryConsume(ip: string): boolean {
    const h = hashIp(ip);
    const now = this.clock();
    return this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM rate_events WHERE kind = ? AND ip_hash = ? AND at <= ?')
        .run(this.kind, h, now - this.windowMs);
      const used = this.db
        .prepare('SELECT COUNT(*) FROM rate_events WHERE kind = ? AND ip_hash = ?')
        .pluck()
        .get(this.kind, h) as number;
      if (used >= this.limit) return false;
      this.db
        .prepare('INSERT INTO rate_events (kind, ip_hash, at) VALUES (?, ?, ?)')
        .run(this.kind, h, now);
      return true;
    })();
  }

  /** Deletes all events of every kind older than the window. Run by the minute job. */
  static sweep(db: Db, now: number, windowMs = HOUR_MS): number {
    return db.prepare('DELETE FROM rate_events WHERE at <= ?').run(now - windowMs).changes;
  }
}
