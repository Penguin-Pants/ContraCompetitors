import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { openDb, runMigrations, type Db } from '../src/db/db.ts';
import { tempDir } from './helpers/app.ts';

function migrationsDir(files: Record<string, string>): string {
  const dir = tempDir('lr-mig-');
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

function tables(db: Db): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .pluck()
    .all() as string[];
}

function recorded(db: Db): string[] {
  return db.prepare('SELECT name FROM schema_migrations ORDER BY name').pluck().all() as string[];
}

describe('runMigrations', () => {
  test('applies files in name order once', () => {
    const dir = migrationsDir({
      '002_b.sql': 'INSERT INTO a (v) VALUES (2);',
      '001_a.sql': 'CREATE TABLE a (v INTEGER); INSERT INTO a (v) VALUES (1);',
    });
    const db = new Database(':memory:');
    expect(runMigrations(db, dir)).toEqual(['001_a.sql', '002_b.sql']);
    expect(db.prepare('SELECT v FROM a ORDER BY rowid').pluck().all()).toEqual([1, 2]);
  });

  test('a second start applies nothing', () => {
    const dataDir = tempDir();
    const dir = migrationsDir({ '001_a.sql': 'CREATE TABLE a (v INTEGER);' });
    openDb(dataDir, dir).close();
    const db = new Database(path.join(dataDir, 'app.db'));
    expect(runMigrations(db, dir)).toEqual([]);
    expect(recorded(db)).toEqual(['001_a.sql']);
  });

  test('a lower-numbered file added after higher ones were applied is still applied', () => {
    const dir = migrationsDir({ '002_rate.sql': 'CREATE TABLE rate (v INTEGER);' });
    const db = new Database(':memory:');
    runMigrations(db, dir);
    fs.writeFileSync(path.join(dir, '001_scores.sql'), 'CREATE TABLE scores (v INTEGER);');
    expect(runMigrations(db, dir)).toEqual(['001_scores.sql']);
    expect(tables(db)).toContain('scores');
    expect(recorded(db)).toEqual(['001_scores.sql', '002_rate.sql']);
  });

  test('a failing file rolls back and stops startup', () => {
    const dataDir = tempDir();
    const dir = migrationsDir({
      '001_ok.sql': 'CREATE TABLE ok (v INTEGER);',
      '002_bad.sql': 'CREATE TABLE half (v INTEGER); THIS IS NOT SQL;',
      '003_later.sql': 'CREATE TABLE later (v INTEGER);',
    });
    expect(() => openDb(dataDir, dir)).toThrow();
    // The failed open closed its handle (Linux: no open file descriptor on app.db).
    const open = fs
      .readdirSync('/proc/self/fd')
      .map((fd) => {
        try {
          return fs.readlinkSync(`/proc/self/fd/${fd}`);
        } catch {
          return '';
        }
      })
      .filter((target) => target.startsWith(path.join(dataDir, 'app.db')));
    expect(open).toEqual([]);
    const db = new Database(path.join(dataDir, 'app.db'));
    expect(tables(db)).not.toContain('half');
    expect(tables(db)).not.toContain('later');
    expect(recorded(db)).toEqual(['001_ok.sql']);
  });

  test('a crash after the SQL but before commit leaves no table and no record; next start applies once', () => {
    const dir = migrationsDir({ '001_a.sql': 'CREATE TABLE a (v INTEGER);' });
    const db = new Database(':memory:');
    expect(() =>
      runMigrations(db, dir, {
        beforeCommit: () => {
          throw new Error('simulated crash');
        },
      }),
    ).toThrow('simulated crash');
    expect(tables(db)).not.toContain('a');
    expect(recorded(db)).toEqual([]);
    expect(runMigrations(db, dir)).toEqual(['001_a.sql']);
    expect(runMigrations(db, dir)).toEqual([]);
    expect(tables(db)).toContain('a');
  });
});
