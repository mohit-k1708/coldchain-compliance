import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDatasetStream } from '../../generator/index.js';
import { parseSchema } from '../../generator/schema.js';
import { parseCsv } from '../../generator/csv.js';
import { run as runEngine } from '../../engine/cli.js';
import { buildReport, renderMarkdown } from '../../engine/report.js';
import { applyTransition } from '../../engine/exceptions.js';
import { openDb } from '../../server/db.js';
import { buildDb, csvSource } from '../../server/build.js';
import { makeDb, startServer, SEED } from './helpers.js';

const { ds, out, db, info: buildInfo } = makeDb();
const srv = await startServer(db);
after(() => srv.close());
const label = (l) => ds.groundTruth.find((g) => g.issue_type === l).shipment_id; // tests may read ground truth

test('row counts equal the source rows; foreign_key_check is clean', () => {
  const extra = { compliance_run: out.runs.length, compliance_finding: out.findings.length, compliance_evidence: out.evidence.length };
  for (const t of parseSchema().order) {
    const want = ds.tables[t].length + (extra[t] ?? 0) + (t === 'excursion_report' ? out.excursions.length : 0) + (t === 'excursion_evidence' ? out.excursionEvidence.length : 0) + (t === 'exception_event' ? buildInfo.workflow.events : 0); // workflow events are seeded by the build
    assert.equal(db.prepare(`SELECT count(*) n FROM ${t}`).get().n, want, t);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('300 shipments: CSV bulk build, counts equal the CSVs, dashboard equals an independent count of compliance_run.csv', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-api-')), res = mkdtempSync(join(tmpdir(), 'cc-apires-'));
  const manifest = await writeDatasetStream({ seed: SEED, shipments: 300 }, dir);
  runEngine({ inDir: dir, outDir: res, asOf: '2026-11-01T00:00:00Z' });
  const big = openDb(':memory:');
  const info = buildDb(big, { sources: [csvSource(dir), csvSource(res)], seed: SEED });
  assert.deepEqual(big.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(info.counts.temperature_reading, manifest.files['temperature_reading.csv'].rows);
  const csvRuns = parseCsv(readFileSync(join(res, 'compliance_run.csv'), 'utf8')).slice(1).filter((r) => r.length > 1);
  const h = parseCsv(readFileSync(join(res, 'compliance_run.csv'), 'utf8'))[0];
  const want = {};
  for (const r of csvRuns) { const s = r[h.indexOf('compliance_status')]; want[s] = (want[s] ?? 0) + 1; }
  const s2 = await startServer(big);
  try {
    const d = (await s2.get('/api/dashboard')).json;
    assert.equal(d.total_shipments, 300);
    assert.equal(d.compliant, want.COMPLIANT ?? 0);
    assert.equal(d.non_compliant, want.NON_COMPLIANT ?? 0);
    assert.equal(d.indeterminate, want.INDETERMINATE ?? 0);
    assert.equal(d.compliant + d.non_compliant + d.indeterminate, d.evaluated);
    // seeded workflow: ~40% progressed and every history row is a legal chain
    const ex = big.prepare("SELECT * FROM excursion_report WHERE source = 'ENGINE'").all();
    const withEvents = ex.filter((e) => big.prepare('SELECT count(*) n FROM exception_event WHERE excursion_id = ?').get(e.excursion_id).n > 0);
    assert.ok(withEvents.length / ex.length > 0.25 && withEvents.length / ex.length < 0.55, `progressed ${withEvents.length}/${ex.length}`);
    for (const e of withEvents) {
      const hist = big.prepare('SELECT * FROM exception_event WHERE excursion_id = ? ORDER BY occurred_at, exception_event_id').all(e.excursion_id);
      let state = { exception: { ...e, status: 'OPEN', assigned_analyst: null, resolution: null, resolved_at: null }, history: [] };
      for (const ev of hist) {
        assert.ok(ev.occurred_at > e.detected_at);
        state = applyTransition(state.exception, state.history, { event_id: ev.exception_event_id, to_status: ev.to_status, analyst: ev.analyst ?? undefined, note: ev.note ?? undefined, resolution: ev.to_status === 'RESOLVED' ? e.resolution : undefined, occurred_at: ev.occurred_at });
      }
      assert.equal(state.exception.status, e.status);
    }
  } finally { await s2.close(); }
});

test('dashboard (each-mix) matches the engine output', async () => {
  const d = (await srv.get('/api/dashboard')).json;
  const c = (s) => out.runs.filter((r) => r.compliance_status === s).length;
  assert.equal(d.total_shipments, ds.tables.shipment.length);
  assert.deepEqual([d.compliant, d.non_compliant, d.indeterminate], [c('COMPLIANT'), c('NON_COMPLIANT'), c('INDETERMINATE')]);
  assert.equal(d.temperature_excursion_runs, out.excursions.filter((x) => x.issue_type === 'TEMP_HIGH' || x.issue_type === 'TEMP_LOW').length);
  assert.equal(d.data_gaps, out.excursions.filter((x) => x.issue_type === 'MISSING_DATA').length);
  assert.ok(d.top_reasons.some((r) => r.rule === 'ALL_RULES_PASS') && d.top_reasons.some((r) => r.rule === 'R-TEMP-03'));
  assert.ok(d.by_product.length > 0);
  assert.equal(Object.values(d.exceptions_by_status).reduce((a, b) => a + b, 0), out.excursions.length);
});

test('shipments list: pagination, filters, sort, prefix search', async () => {
  const all = (await srv.get('/api/shipments?pageSize=200')).json;
  assert.equal(all.total, 15);
  assert.equal(all.items.length, 15);
  const p2 = (await srv.get('/api/shipments?page=2&pageSize=4')).json;
  assert.deepEqual(p2.items.map((x) => x.id), all.items.slice(4, 8).map((x) => x.id));
  assert.equal(p2.total, 15);
  assert.equal((await srv.get('/api/shipments?page=99&pageSize=4')).json.items.length, 0);
  const nc = (await srv.get('/api/shipments?status=NON_COMPLIANT')).json;
  assert.equal(nc.total, out.runs.filter((r) => r.compliance_status === 'NON_COMPLIANT').length);
  assert.ok(nc.items.every((x) => x.compliance_status === 'NON_COMPLIANT'));
  const prod = all.items[0].product_id;
  assert.ok((await srv.get(`/api/shipments?productId=${prod}`)).json.items.every((x) => x.product_id === prod));
  assert.equal((await srv.get('/api/shipments?shipmentStatus=CANCELLED')).json.total, 0);
  assert.deepEqual((await srv.get('/api/shipments?q=SHP-2026-00000&pageSize=200')).json.items.map((x) => x.id), all.items.map((x) => x.id).filter((i) => i.startsWith('SHP-2026-00000')));
  const desc = (await srv.get('/api/shipments?sort=-id&pageSize=3')).json.items.map((x) => x.id);
  assert.deepEqual(desc, all.items.map((x) => x.id).reverse().slice(0, 3));
  const it = all.items[0];
  for (const k of ['id', 'product', 'lot_ids', 'origin_location', 'destination_location', 'logger_id', 'shipment_status', 'compliance_status', 'reason_summary']) assert.ok(k in it, k);
  assert.ok(Array.isArray(it.lot_ids) && it.lot_ids.length >= 1);
});

test('shipment detail has policy, logger, route, custody, findings with evidence', async () => {
  const id = label('TEMPERATURE_EXCURSION');
  const d = (await srv.get(`/api/shipments/${id}`)).json;
  assert.equal(d.shipment.shipment_id, id);
  assert.ok(d.product.product_name && d.lots.length >= 1 && d.packaging.length === 1);
  assert.ok(d.applied_policy.policy_id && d.policy_used.policy_id);
  assert.ok(d.logger_assignments[0].logger.device_serial_number && d.logger_assignments[0].calibrations.length >= 1);
  assert.ok(d.status_history.length === 4 && d.route_stops.length >= 3 && d.custody_events.length >= 3);
  assert.equal(d.compliance_run.compliance_status, 'NON_COMPLIANT');
  assert.ok(d.compliance_run.reason_summary.startsWith('NON_COMPLIANT [R-TEMP-03]'));
  const f = d.findings.find((x) => x.rule_code === 'R-TEMP-03');
  assert.equal(f.result, 'FAIL');
  assert.ok(f.evidence_count > 0 && f.evidence_reading_ids.length === Math.min(50, f.evidence_count));
  assert.ok(d.exceptions.length >= 1 && Array.isArray(d.exceptions[0].history));
  assert.ok(d.legacy_excursion_reports.length >= 1 && d.legacy_reports.length === 1);
  const noLogger = (await srv.get(`/api/shipments/${label('LOGGER_NOT_ASSIGNED')}`)).json;
  assert.ok(noLogger.logger_assignments.length <= 1);
});

test('readings endpoint: classification count equals the engine report', async () => {
  for (const l of ['NONE', 'TEMPERATURE_EXCURSION', 'CALIBRATION_MARGINAL']) {
    const id = label(l);
    const r = (await srv.get(`/api/shipments/${id}/readings`)).json;
    const eng = buildReport(ds.tables, id).temperature.class_counts;
    assert.deepEqual(r.counts, eng, l);
    assert.equal(r.readings.length, eng.IN + eng.OUT + eng.MARGINAL);
    assert.ok(r.policy.min_temp_c < r.policy.max_temp_c);
    assert.ok(r.readings.every((x, i) => i === 0 || x.recorded_at > r.readings[i - 1].recorded_at));
  }
  const te = (await srv.get(`/api/shipments/${label('TEMPERATURE_EXCURSION')}/readings`)).json;
  assert.ok(te.excursion_periods.length >= 1 && te.excursion_periods[0].start_time && te.excursion_periods[0].end_time);
  const gap = (await srv.get(`/api/shipments/${label('MISSING_DATA')}/readings`)).json;
  assert.equal(gap.gap_periods.length, 1);
});

test('report endpoint equals engine buildReport (json, md, html)', async () => {
  for (const l of ['NONE', 'TEMPERATURE_EXCURSION', 'MISSING_DATA_SILENTLY_PASSED', 'LOGGER_NOT_ASSIGNED', 'CUSTODY_GAP', 'CROSS_SHIPMENT_EXCURSION']) {
    const id = label(l);
    const want = JSON.parse(JSON.stringify(buildReport(ds.tables, id)));
    const got = (await srv.get(`/api/shipments/${id}/report`)).json;
    want.history.exceptions = got.history.exceptions = []; // workflow history exists only in the DB
    assert.deepEqual(got, want, l);
  }
  const id = label('NONE');
  const md = await srv.get(`/api/shipments/${id}/report?format=md`);
  assert.equal(md.text, renderMarkdown(buildReport(ds.tables, id)));
  assert.match(md.headers.get('content-type'), /markdown/);
  const html = await srv.get(`/api/shipments/${id}/report?format=html`);
  assert.match(html.headers.get('content-type'), /html/);
  assert.ok(html.text.startsWith('<!doctype html>'));
  assert.equal((await srv.get(`/api/shipments/${id}/report?format=pdf`)).status, 400);
});

test('exceptions list and detail', async () => {
  const list = (await srv.get('/api/exceptions?pageSize=200')).json;
  assert.equal(list.total, out.excursions.length);
  assert.ok(list.items.every((x) => x.source === 'ENGINE'));
  const legacy = (await srv.get('/api/exceptions?source=LEGACY_IMPORT&pageSize=200')).json;
  assert.ok(legacy.total > 0 && legacy.items.every((x) => x.source === 'LEGACY_IMPORT'));
  const sev = (await srv.get('/api/exceptions?severity=HIGH&pageSize=200')).json;
  assert.ok(sev.items.every((x) => x.severity === 'HIGH'));
  const one = list.items[0];
  const d = (await srv.get(`/api/exceptions/${one.excursion_id}`)).json;
  assert.equal(d.exception.excursion_id, one.excursion_id);
  assert.ok(Array.isArray(d.history) && typeof d.evidence_count === 'number');
  const byShip = (await srv.get(`/api/exceptions?shipmentId=${one.shipment_id}`)).json;
  assert.ok(byShip.items.every((x) => x.shipment_id === one.shipment_id));
  assert.equal((await srv.get('/api/exceptions?status=BOGUS')).status, 400);
});

test('error shapes: 404 and 400; never a stack trace', async () => {
  const nf = await srv.get('/api/shipments/SHP-2026-999999');
  assert.equal(nf.status, 404);
  assert.deepEqual(Object.keys(nf.json), ['error']);
  assert.deepEqual(Object.keys(nf.json.error).sort(), ['code', 'message']);
  assert.equal(nf.json.error.code, 'NOT_FOUND');
  for (const p of ['/api/shipments/SHP-2026-999999/readings', '/api/shipments/SHP-2026-999999/report', '/api/exceptions/EXCR-9', '/api/nope']) assert.equal((await srv.get(p)).status, 404, p);
  for (const p of ['/api/shipments?page=0', '/api/shipments?page=abc', '/api/shipments?pageSize=-5', '/api/shipments?status=NOPE', '/api/shipments?sort=drop']) {
    const r = await srv.get(p);
    assert.equal(r.status, 400, p);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    assert.ok(!/at .*\.js|stack/i.test(r.text));
  }
});

test('SQL injection strings are inert; pageSize is capped at 200', async () => {
  const evil = encodeURIComponent("'; DROP TABLE shipment; --");
  assert.equal((await srv.get(`/api/shipments?q=${evil}`)).json.total, 0);
  assert.equal((await srv.get(`/api/shipments?productId=${evil}`)).json.total, 0);
  assert.equal((await srv.get(`/api/exceptions?shipmentId=${evil}`)).json.total, 0);
  assert.equal((await srv.get(`/api/shipments?status=${encodeURIComponent("COMPLIANT' OR '1'='1")}`)).status, 400);
  assert.equal((await srv.get(`/api/shipments/${evil}`)).status, 404);
  assert.equal((await srv.get('/api/shipments?q=%25')).json.total, 0); // LIKE wildcard is escaped
  assert.equal((await srv.get('/api/shipments?q=_')).json.total, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM shipment').get().n, 15); // table intact
  const big = (await srv.get('/api/shipments?pageSize=100000')).json;
  assert.equal(big.pageSize, 200);
  const h = (await srv.get('/api/health')).json;
  assert.equal(h.ok, true);
  assert.equal(h.db.shipment, 15);
});
