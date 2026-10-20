import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

export interface MigrationHooks {
  /** Test-only: runs inside the migration transaction after the SQL and the record, before commit. */
  beforeCommit?: (file: string) => void;
}

/**
 * Applies every `*.sql` file in `dir` that is not yet recorded in `schema_migrations`, in name order.
 * Each file and its record commit in one transaction. Migration files must not contain
 * BEGIN or COMMIT statements.
 */
export function runMigrations(db: Db, dir: string = MIGRATIONS_DIR, hooks: MigrationHooks = {}) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .pluck()
      .all()
      .map((name) => String(name)),
  );
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];
  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, Date.now());
      hooks.beforeCommit?.(file);
    })();
    newlyApplied.push(file);
  }
  return newlyApplied;
}

export function openDb(dataDir: string, migrationsDir: string = MIGRATIONS_DIR): Db {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'app.db'));
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db, migrationsDir);
  } catch (err) {
    // A failed start must not keep the file handle open.
    db.close();
    throw err;
  }
  return db;
}
