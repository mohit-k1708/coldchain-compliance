import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { writeDatasetStream, generateDataset, renderFiles } from '../../generator/index.js';
import { validateDir } from '../../generator/validateData.js';
import { csvLine } from '../../generator/csv.js';
import { parseSchema } from '../../generator/schema.js';
import { loadDataset } from '../../engine/loadDataset.js';
import { ReadingStore } from '../../engine/readingStore.js';
import { evaluateAll } from '../../engine/index.js';
import { exportSql } from '../../scripts/export.js';
import { reproduce } from '../../scripts/reproduce.js';

const SEED = 20261022;
const tmp = () => mkdtempSync(join(tmpdir(), 'cc-scale-'));
const dir100 = tmp();
await writeDatasetStream({ seed: SEED, shipments: 100 }, dir100);

test('a: 300 shipments stream-validate with 0 integrity errors and observations equal ground truth', async () => {
  const dir = tmp();
  await writeDatasetStream({ seed: SEED, shipments: 300 }, dir);
  const v = validateDir(dir);
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 3)));
  assert.deepEqual(v.manifestProblems, []);
  assert.ok(v.integrityPass);
  for (const [k, o] of Object.entries(v.obsVsTruth)) assert.ok(o.match, `${k}: ${o.observed} vs ${o.ground_truth}`);
  assert.equal(v.summary.counts.shipment, 300);
});

test('a2: streaming files are byte-identical to the in-memory renderer', async () => {
  const mem = renderFiles(generateDataset({ seed: SEED, shipments: 100 }));
  for (const [name, content] of Object.entries(mem)) assert.equal(readFileSync(join(dir100, name), 'utf8'), content, name);
});

test('b: determinism across separate child processes (100 shipments)', () => {
  const r = reproduce({ seed: SEED, shipments: 100 });
  assert.ok(r.pass, JSON.stringify(r.rows.filter((x) => !x.match)));
  assert.ok(r.rows.some((x) => x.file === 'ground_truth.csv' && x.match));
});

test('c: ReadingStore evaluation equals the in-memory loader (100 shipments)', () => {
  const oldWay = evaluateAll(loadDataset(dir100));
  const store = ReadingStore.load(join(dir100, 'temperature_reading.csv'));
  const newWay = evaluateAll(loadDataset(dir100, { skip: ['temperature_reading'] }), { readingStore: store });
  assert.equal(oldWay.runs.length, 100);
  for (const k of ['runs', 'findings', 'evidence', 'excursions', 'excursionEvidence']) assert.deepEqual(newWay[k], oldWay[k], k);
});

test('d: export:sql loads into sqlite with FKs on; row counts equal the CSVs', () => {
  const sqlFile = join(tmp(), 'seed.sql');
  exportSql(dir100, sqlFile);
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(sqlFile, 'utf8'));
  const manifest = JSON.parse(readFileSync(join(dir100, 'manifest.json'), 'utf8'));
  for (const t of parseSchema().order) {
    assert.equal(db.prepare(`SELECT count(*) c FROM ${t}`).get().c, manifest.files[`${t}.csv`].rows, t);
  }
});

test('e: .gitattributes exists and CSV output never contains CR', () => {
  const ga = readFileSync(new URL('../../.gitattributes', import.meta.url), 'utf8');
  for (const line of ['*.csv text eol=lf', '*.sql text eol=lf', '*.json text eol=lf', '*.gz binary', '*.md text eol=lf']) assert.ok(ga.includes(line), line);
  assert.ok(!csvLine('party', { party_id: 'PTY-000001', party_name: 'a\r\nb', party_type: 'CARRIER' }).includes('\r'));
  for (const f of readdirSync(dir100).filter((x) => x.endsWith('.csv') || x.endsWith('.json'))) {
    assert.ok(!readFileSync(join(dir100, f), 'utf8').includes('\r'), f);
  }
  assert.ok(existsSync(join(dir100, 'ground_truth.csv')));
});
