import type { Db } from '../db/db.ts';
import { canonicalHost, hostSuffixes } from '../net/hostname.ts';

/**
 * Domain blocklist (SEC-5). A canonical host is blocked when it equals an entry or ends with
 * `.` + entry. Reads go to SQLite every time, so entries added by the CLI (another process) apply
 * at once.
 */
export class Blocklist {
  private readonly db: Db;
  private readonly clock: () => number;

  constructor(db: Db, clock: () => number = Date.now) {
    this.db = db;
    this.clock = clock;
  }

  /** Adds an entry. Returns the stored canonical form, or null for an invalid domain. */
  add(domain: string): string | null {
    const entry = canonicalHost(domain);
    if (!entry) return null;
    this.db
      .prepare('INSERT OR IGNORE INTO blocklist (domain, created_at) VALUES (?, ?)')
      .run(entry, this.clock());
    return entry;
  }

  remove(domain: string): boolean {
    const entry = canonicalHost(domain);
    if (!entry) return false;
    return this.db.prepare('DELETE FROM blocklist WHERE domain = ?').run(entry).changes > 0;
  }

  list(): string[] {
    return this.db
      .prepare('SELECT domain FROM blocklist ORDER BY domain')
      .pluck()
      .all() as string[];
  }

  /** `host` must be canonical (see canonicalHost). */
  isBlocked(host: string): boolean {
    const suffixes = hostSuffixes(host);
    const marks = suffixes.map(() => '?').join(',');
    return !!this.db
      .prepare(`SELECT 1 FROM blocklist WHERE domain IN (${marks}) LIMIT 1`)
      .get(...suffixes);
  }
}
