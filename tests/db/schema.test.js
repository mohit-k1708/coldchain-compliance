import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ddl = readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8');
const T0 = '2026-01-01T00:00:00Z', T1 = '2026-01-02T00:00:00Z', T2 = '2026-01-03T00:00:00Z';
let db;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(ddl);
});

const run = (sql, ...p) => db.prepare(sql).run(...p);

function seed() {
  run(`INSERT INTO party VALUES ('p1','Acme','SUPPLIER'),('p2','Depot','WAREHOUSE')`);
  run(`INSERT INTO product VALUES ('pr1','Vax','VACCINE','p1',2,8,30,?)`, T0);
  run(`INSERT INTO lot VALUES ('l1','pr1','2025-01-01','2027-01-01','RELEASED',?)`, T0);
  run(`INSERT INTO threshold_policy VALUES ('pol1','pr1',1,2,8,30,60,5,15,?,NULL,'ACTIVE')`, T0);
  run(`INSERT INTO shipment VALUES ('s1','pr1','pol1','A','B','p1','p2',?,?,NULL,NULL,'PLANNED',?)`, T0, T1, T0);
  run(`INSERT INTO shipment_lot VALUES ('s1','l1',10)`);
  run(`INSERT INTO logger VALUES ('lg1','SN1','VALID',NULL,NULL,0.5,'AVAILABLE')`);
  run(`INSERT INTO logger_assignment VALUES ('a1','lg1','s1',?,?,'ASSIGNED')`, T0, T2);
}
const reading = (id, logger = 'lg1', at = T0) =>
  run(`INSERT INTO temperature_reading VALUES (?,?,?,?,?,5.0,0.5,'GOOD')`, id, logger, 'a1', at, at);

test('schema loads with all 22 tables', () => {
  const n = db.prepare(`SELECT count(*) c FROM sqlite_master WHERE type='table'`).get().c;
  assert.equal(n, 22);
});

test('valid minimal chain inserts', () => {
  seed(); reading('r1');
  assert.equal(db.prepare('SELECT count(*) c FROM temperature_reading').get().c, 1);
});

test('orphan FK rejected', () => {
  seed();
  assert.throws(() => reading('r1', 'nope'), /FOREIGN KEY/);
});

test('max<min rejected for product and policy', () => {
  seed();
  assert.throws(() => run(`INSERT INTO product VALUES ('pr2','X','OTHER','p1',8,2,1,?)`, T0), /CHECK/);
  assert.throws(() => run(`INSERT INTO threshold_policy VALUES ('pol2','pr1',2,8,2,1,1,1,1,?,NULL,'DRAFT')`, T0), /CHECK/);
});

test('bad enum rejected', () => {
  seed();
  assert.throws(() => run(`UPDATE shipment SET shipment_status='LOST'`), /CHECK/);
});

test('duplicate (logger_id, recorded_at) rejected', () => {
  seed(); reading('r1');
  assert.throws(() => reading('r2'), /UNIQUE/);
});

test('arrival_time < departure_time rejected', () => {
  seed();
  assert.throws(() => run(`UPDATE shipment SET departure_time=?, arrival_time=?`, T1, T0), /CHECK/);
});

test('overlapping logger assignments are accepted (intentional gap)', () => {
  seed();
  run(`INSERT INTO shipment VALUES ('s2','pr1','pol1','A','B','p1','p2',?,?,NULL,NULL,'PLANNED',?)`, T0, T1, T0);
  run(`INSERT INTO logger_assignment VALUES ('a2','lg1','s2',?,?,'ASSIGNED')`, T1, T2);
  assert.equal(db.prepare('SELECT count(*) c FROM logger_assignment').get().c, 2);
});

test('excursion_report end<start rejected', () => {
  seed();
  assert.throws(() => run(
    `INSERT INTO excursion_report VALUES ('e1','s1',NULL,NULL,NULL,NULL,'ENGINE','TEMP_HIGH',?,?,NULL,NULL,'LOW','OPEN',?,NULL,NULL,NULL,NULL)`,
    T1, T0, T0), /CHECK/);
});
