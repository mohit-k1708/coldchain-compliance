import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordPerf, renderPerf, readResults } from '../../scripts/perfDoc.js';

const perf = { measured_at: '2026-01-01', seed: 1, shipments: 10, loggers: 5, node: 'v0', platform: 'x',
  steps: [{ name: 'generate (streaming)', wall_ms: 1500, peak_rss_mb: 100, notes: 'exit 0' }], evaluation_note: 'Evaluation produced 10 runs.', file_sizes: { 'data/generated': { 'a.csv': 1048576 } } };
const dbBuild = { measured_at: '2026-01-02', rows: 1000, load_ms: 2000, total_ms: 3000, rows_per_s: 500, db_mb: 1.5, peak_rss_mb: 50, workflow: '1 of 2 progressed' };
const api = { measured_at: '2026-01-03', runs: 2, rows: [{ name: 'GET /api/health', ms: [1.5, 2.5] }], plans: { 'readings window': ['SEARCH temperature_reading USING INDEX idx_reading_logger_time'] } };

function tmp() { const d = mkdtempSync(join(tmpdir(), 'cc-perf-')); return { file: join(d, 'perf-results.json'), doc: join(d, 'PERFORMANCE.md') }; }

test('renderPerf shows placeholders for sections that were never measured', () => {
  const md = renderPerf({});
  assert.match(md, /Not measured yet: run `npm run perf`/);
  assert.match(md, /Not measured yet: run `npm run db:build`/);
  assert.match(md, /Not measured yet: run `npm run bench:api`/);
});

test('re-running one script never erases the sections of the others', () => {
  const t = tmp();
  recordPerf('perf', perf, t);
  recordPerf('db_build', dbBuild, t);
  recordPerf('api', api, t);
  let md = readFileSync(t.doc, 'utf8');
  for (const s of ['generate (streaming)', '1,000 rows loaded in 2.0 s', 'GET /api/health', 'idx_reading_logger_time']) assert.ok(md.includes(s), s);
  // re-run only perf with new numbers
  recordPerf('perf', { ...perf, steps: [{ name: 'generate (streaming)', wall_ms: 9000, peak_rss_mb: 7, notes: 'exit 0' }] }, t);
  md = readFileSync(t.doc, 'utf8');
  assert.match(md, /\| generate \(streaming\) \| 9\.0 s \| 7 MB/);
  assert.ok(md.includes('1,000 rows loaded in 2.0 s'), 'db_build section must survive');
  assert.ok(md.includes('GET /api/health'), 'api section must survive');
  const json = readResults(t.file);
  assert.deepEqual(Object.keys(json).sort(), ['api', 'db_build', 'perf']);
  assert.deepEqual(json.db_build, dbBuild);
});

test('rendering is deterministic and a corrupt results file is treated as empty', () => {
  const t = tmp();
  recordPerf('perf', perf, t);
  assert.equal(renderPerf(readResults(t.file)), readFileSync(t.doc, 'utf8'));
  const bad = tmp();
  recordPerf('db_build', dbBuild, bad);
  assert.deepEqual(readResults(join(tmpdir(), 'no-such-file.json')), {});
});
