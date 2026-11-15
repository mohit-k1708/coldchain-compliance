import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { generateDataset, renderFiles } from '../../generator/index.js';
import { validateDataset } from '../../generator/validateData.js';
import { parseSchema } from '../../generator/schema.js';
import * as ids from '../../generator/ids.js';

const SEED = 20261022;
const gen = (seed = SEED) => generateDataset({ seed, shipments: 1 });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ms = (s) => Date.parse(s);
const MIN = 60000;

test('a: deterministic per seed; different seed changes readings', () => {
  const f1 = renderFiles(gen()), f2 = renderFiles(gen());
  assert.deepEqual(Object.keys(f1), Object.keys(f2));
  for (const k of Object.keys(f1)) assert.equal(sha(f1[k]), sha(f2[k]), k);
  const other = renderFiles(gen(SEED + 1));
  assert.notEqual(sha(f1['temperature_reading.csv']), sha(other['temperature_reading.csv']));
});

test('b: id formats', () => {
  assert.equal(ids.lotId(1), 'LOT-2026-000001');
  assert.equal(ids.shipmentId(1), 'SHP-2026-000001');
  assert.equal(ids.assignmentId('SHP-2026-000001', 1), 'LOG-SHP-2026-000001-01');
  assert.equal(ids.readingId('LGR-000001', Date.parse('2026-03-12T10:10:00Z')), 'TEMP-LGR-000001-20260312T101000Z');
  assert.equal(ids.excursionId(1), 'EXCR-2026-000001');
  assert.equal(ids.runId(1), 'RUN-2026-000001');
  const pats = {
    party_id: /^PTY-\d{6}$/, product_id: /^PRD-\d{6}$/, lot_id: /^LOT-2026-\d{6}$/, packaging_id: /^PKG-\d{6}$/,
    logger_id: /^LGR-\d{6}$/, calibration_id: /^CAL-\d{6}$/, policy_id: /^POL-\d{6}$/,
    shipment_id: /^SHP-2026-\d{6}$/, history_id: /^HST-2026-\d{6}$/,
    logger_assignment_id: /^LOG-SHP-2026-\d{6}-\d{2}$/, reading_id: /^TEMP-LGR-\d{6}-\d{8}T\d{6}Z$/,
    custody_event_id: /^CUS-2026-\d{6}$/, route_stop_id: /^RST-2026-\d{6}$/, legacy_report_id: /^LEG-2026-\d{6}$/,
  };
  const { tables } = gen();
  const { tables: schema } = parseSchema();
  let checked = 0;
  for (const [t, rows] of Object.entries(tables)) {
    if (!rows.length) continue; // later-phase tables are empty in this slice
    for (const c of schema[t].pk) {
      if (c === 'assigned_from') continue; // timestamp part of shipment_packaging's composite PK
      assert.ok(pats[c], `no pattern for ${t}.${c}`);
      for (const r of rows) { assert.match(r[c], pats[c], `${t}.${c}`); checked++; }
    }
  }
  assert.ok(checked > 100);
});

test('c: validator passes clean data and catches injected defects', () => {
  const { tables } = gen();
  const clean = validateDataset(tables);
  assert.equal(clean.errors.length, 0, JSON.stringify(clean.errors.slice(0, 3)));

  const rule = (mut) => {
    const t = structuredClone(tables);
    mut(t);
    return new Set(validateDataset(t).errors.map((e) => e.rule));
  };
  assert.ok(rule((t) => t.party.push({ ...t.party[0] })).has('PK_UNIQUE'));
  assert.ok(rule((t) => { t.shipment[0].product_id = 'PRD-999999'; }).has('FK_INTEGRITY'));
  assert.ok(rule((t) => { t.shipment[0].arrival_time = '2026-01-01T00:00:00Z'; }).has('DATE_ORDER'));
  assert.ok(rule((t) => {
    const a = t.logger_assignment[0];
    t.logger_assignment.push({ ...a, logger_assignment_id: 'LOG-SHP-2026-000001-02' });
  }).has('ASSIGNMENT_OVERLAP'));
});

test('d: readings', () => {
  const { tables } = gen();
  const s = tables.shipment[0];
  const a = tables.logger_assignment[0];
  const pol = tables.threshold_policy.find((p) => p.policy_id === s.policy_id);
  const dep = ms(s.departure_time), arr = ms(s.arrival_time);
  const rs = tables.temperature_reading;
  assert.equal(rs.length, Math.floor((arr - dep) / (10 * MIN)) + 1);
  for (const r of rs) {
    const t = ms(r.recorded_at);
    assert.equal(t % (10 * MIN), 0);
    assert.ok(r.temperature_c >= pol.min_temp_c && r.temperature_c <= pol.max_temp_c);
    assert.ok(t >= ms(a.assigned_from) && t <= ms(a.assigned_to));
    assert.ok(ms(r.received_at) - t >= MIN && ms(r.received_at) - t <= 5 * MIN);
    assert.equal(r.reading_quality, 'GOOD');
  }
});

test('e: custody chain and route order', () => {
  const { tables } = gen();
  const c = [...tables.custody_event].sort((x, y) => x.event_sequence - y.event_sequence);
  assert.equal(c[0].event_type, 'PICKUP');
  assert.equal(c.at(-1).event_type, 'DELIVERY');
  assert.ok(c.length >= 3);
  for (let i = 1; i < c.length; i++) {
    assert.equal(c[i].from_party_id, c[i - 1].to_party_id);
    assert.ok(ms(c[i].event_timestamp) > ms(c[i - 1].event_timestamp));
  }
  for (const e of c) assert.ok(ms(e.recorded_at) >= ms(e.event_timestamp));
  const pol = tables.threshold_policy.find((p) => p.policy_id === tables.shipment[0].policy_id);
  const stops = tables.route_stop;
  const bySeq = (k) => [...stops].sort((a, b) => a[k] - b[k]).map((s) => s.route_stop_id);
  assert.deepEqual(bySeq('actual_sequence'), bySeq('stop_sequence'));
  const ordered = [...stops].sort((a, b) => a.actual_sequence - b.actual_sequence);
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (s.actual_departure) {
      assert.ok((ms(s.actual_departure) - ms(s.actual_arrival)) / MIN <= pol.max_dwell_minutes);
    }
    if (i > 0) assert.ok(ms(s.actual_arrival) > ms(ordered[i - 1].actual_departure));
    assert.ok((ms(s.actual_arrival) - ms(s.planned_arrival)) / MIN <= 15);
  }
  assert.deepEqual(ordered.map((s) => s.stop_type)[0], 'ORIGIN');
  assert.equal(ordered.at(-1).stop_type, 'DESTINATION');
});

test('f: loads into sqlite with FKs on; joins work', () => {
  const { tables } = gen();
  const { order, tables: schema } = parseSchema();
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
  for (const t of order) {
    const cols = schema[t].columns.map((c) => c.name);
    const st = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of tables[t]) st.run(...cols.map((c) => (typeof r[c] === 'boolean' ? Number(r[c]) : r[c] ?? null)));
  }
  const j = db.prepare(`SELECT count(*) c FROM shipment s JOIN shipment_lot sl ON sl.shipment_id=s.shipment_id
    JOIN lot l ON l.lot_id=sl.lot_id JOIN product p ON p.product_id=l.product_id
    JOIN threshold_policy tp ON tp.policy_id=s.policy_id AND tp.product_id=p.product_id`).get().c;
  assert.ok(j >= 1);
  const joined = db.prepare(`SELECT count(*) c FROM temperature_reading r JOIN logger_assignment a
    ON a.logger_id=r.logger_id AND r.recorded_at BETWEEN a.assigned_from AND a.assigned_to`).get().c;
  assert.equal(joined, tables.temperature_reading.length);
});

test('g: no ground-truth leakage into input tables', () => {
  const { tables, groundTruth } = gen();
  assert.ok(!('ground_truth' in tables));
  assert.equal(groundTruth.length, 1);
  const { tables: schema } = parseSchema();
  for (const [t, def] of Object.entries(schema)) {
    if (t === 'excursion_report') continue; // output table (empty in this slice); legitimately has issue_type
    for (const c of def.columns) assert.ok(c.name !== 'issue_type' && !c.name.startsWith('ground_truth'), `${t}.${c.name}`);
  }
});
