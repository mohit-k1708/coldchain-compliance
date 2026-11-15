import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const SCHEMA = new URL('../database/schema.sql', import.meta.url);

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}

// schema.sql is the single DDL. withIndexes=false defers CREATE INDEX statements until after a bulk load.
export function applySchema(db, { withIndexes = true } = {}) {
  const sql = readFileSync(SCHEMA, 'utf8');
  const lines = sql.split('\n');
  const indexes = lines.filter((l) => l.startsWith('CREATE INDEX'));
  db.exec(withIndexes ? sql : lines.filter((l) => !l.startsWith('CREATE INDEX')).join('\n'));
  return indexes;
}

const cache = new WeakMap();
export function stmt(db, sql) {
  let m = cache.get(db);
  if (!m) { m = new Map(); cache.set(db, m); }
  let s = m.get(sql);
  if (!s) { s = db.prepare(sql); m.set(sql, s); }
  return s;
}
export const all = (db, sql, ...p) => stmt(db, sql).all(...p);
export const get = (db, sql, ...p) => stmt(db, sql).get(...p);
export const run = (db, sql, ...p) => stmt(db, sql).run(...p);

export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// next numeric suffix for IDs like PRD-000007 / SHP-2026-000007 (max existing + 1; IDs are zero-padded so text order is numeric order)
export function nextNumber(db, table, col, prefix) {
  const r = get(db, `SELECT ${col} AS id FROM ${table} WHERE ${col} LIKE ? ORDER BY ${col} DESC LIMIT 1`, `${prefix}%`);
  return r ? Number(String(r.id).match(/(\d+)$/)[1]) + 1 : 1;
}

export const bool = (v) => (v === true ? 1 : v === false ? 0 : v);
