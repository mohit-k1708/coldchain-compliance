import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateDataset, renderFiles } from '../../generator/index.js';
import { validateDataset } from '../../generator/validateData.js';
import { parseSchema } from '../../generator/schema.js';

const SEED = 20261022;
const MIN = 60000;
const ms = (s) => Date.parse(s);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const big = generateDataset({ seed: SEED, shipments: 200 });
const each = generateDataset({ seed: SEED, mix: 'each' });

const EXPECT = {
  NONE: 'COMPLIANT', BOUNDARY_AT_LIMIT: 'COMPLIANT', EXCURSION_WITHIN_ALLOWANCE: 'COMPLIANT',
  TEMPERATURE_EXCURSION: 'NON_COMPLIANT', CALIBRATION_MARGINAL: 'INDETERMINATE', MISSING_DATA: 'INDETERMINATE',
  MISSING_DATA_SILENTLY_PASSED: 'INDETERMINATE', LOGGER_NOT_ASSIGNED: 'INDETERMINATE', CALIBRATION_EXPIRED: 'INDETERMINATE',
  POLICY_MISMATCH: 'INDETERMINATE', CUSTODY_GAP: 'INDETERMINATE', ROUTE_DEVIATION: 'NON_COMPLIANT',
  CROSS_SHIPMENT_EXCURSION: 'COMPLIANT',
};

// ---- small independent helpers (deliberately not importing injector/engine code) ----
function ctx(ds) {
  const t = ds.tables;
  const by = (rows, k) => { const m = new Map(); for (const r of rows) { if (!m.has(r[k])) m.set(r[k], []); m.get(r[k]).push(r); } return m; };
  const ship = new Map(t.shipment.map((s) => [s.shipment_id, s]));
  const pol = new Map(t.threshold_policy.map((p) => [p.policy_id, p]));
  const assigns = by(t.logger_assignment, 'shipment_id');
  const stops = by(t.route_stop, 'shipment_id');
  const cust = by(t.custody_event, 'shipment_id');
  const legacy = by(t.legacy_report, 'shipment_id');
  const readings = (sid) => {
    const ids = new Set((assigns.get(sid) ?? []).map((a) => a.logger_assignment_id));
    return t.temperature_reading.filter((r) => ids.has(r.logger_assignment_id)).sort((a, b) => ms(a.recorded_at) - ms(b.recorded_at));
  };
  const limits = (sid) => pol.get(ship.get(sid).policy_id);
  return { t, ship, pol, assigns, stops, cust, legacy, readings, limits };
}
const isOut = (r, p) => r.temperature_c > p.max_temp_c + r.calibration_uncertainty_c || r.temperature_c < p.min_temp_c - r.calibration_uncertainty_c;
function outMinutes(rs, p) { // sample-and-hold, 10 min per OUT reading
  let m = 0;
  rs.forEach((r, i) => { if (isOut(r, p)) m += i + 1 < rs.length ? (ms(rs[i + 1].recorded_at) - ms(r.recorded_at)) / MIN : 10; });
  return m;
}
const gtOf = (ds, label) => ds.groundTruth.filter((g) => g.issue_type === label);

test('a: --mix=each gives one row per shipment with the expected decision', () => {
  const gt = each.groundTruth;
  assert.equal(gt.length, each.tables.shipment.length);
  assert.equal(gt.length, 15);
  for (const g of gt) assert.equal(g.expected_decision, EXPECT[g.issue_type], g.issue_type);
  for (const l of Object.keys(EXPECT)) assert.equal(gtOf(each, l).length, l === 'NONE' || l === 'CROSS_SHIPMENT_EXCURSION' ? 2 : 1, l);
  const csv = renderFiles(each)['ground_truth.csv'].split('\n');
  assert.equal(csv[0], 'shipment_id,issue_type,variant,expected_decision,expected_evidence_category,expected_rule,expected_excursion_minutes,expected_gap_minutes,related_shipment_id');
});

test('b: zero integrity errors; loads into sqlite with FKs on', () => {
  for (const ds of [big, each]) {
    const v = validateDataset(ds.tables);
    assert.equal(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 3)));
    const { order, tables: schema } = parseSchema();
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
    for (const t of order) {
      const cols = schema[t].columns.map((c) => c.name);
      const st = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const r of ds.tables[t]) st.run(...cols.map((c) => (typeof r[c] === 'boolean' ? Number(r[c]) : r[c] ?? null)));
    }
  }
});

test('c1: validator observations equal the labels (observed sets == ground-truth sets)', () => {
  const o = validateDataset(big.tables).observations;
  const ids = (...ls) => ls.flatMap((l) => gtOf(big, l).map((g) => g.shipment_id)).sort();
  assert.deepEqual(o.assignmentOverlap, []);
  assert.deepEqual(o.noCoveringAssignment, ids('LOGGER_NOT_ASSIGNED'));
  assert.deepEqual(o.custodyDiscontinuity, ids('CUSTODY_GAP'));
  assert.deepEqual(o.routeMismatch, ids('ROUTE_DEVIATION'));
  assert.deepEqual(o.readingGap, ids('MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED'));
  assert.deepEqual(o.policyMismatch, ids('POLICY_MISMATCH'));
  assert.deepEqual(o.expiredCalibration, ids('CALIBRATION_EXPIRED'));
});

test('c2: injected facts, recomputed from raw rows', () => {
  const c = ctx(big);
  for (const l of Object.keys(EXPECT)) assert.ok(gtOf(big, l).length >= 2, `${l} has >=2 shipments`);
  for (const g of big.groundTruth) {
    const s = c.ship.get(g.shipment_id), p = c.limits(g.shipment_id), A = p.max_excursion_minutes;
    const dep = ms(s.departure_time), arr = ms(s.arrival_time);
    const rs = c.readings(g.shipment_id);
    switch (g.issue_type) {
      case 'NONE': assert.equal(outMinutes(rs, p), 0); break;
      case 'MISSING_DATA':
      case 'MISSING_DATA_SILENTLY_PASSED': {
        let gap = 0;
        for (let i = 1; i < rs.length; i++) gap = Math.max(gap, (ms(rs[i].recorded_at) - ms(rs[i - 1].recorded_at)) / MIN);
        assert.ok(gap >= 40);
        assert.equal(Number(g.expected_gap_minutes), gap);
        assert.equal(ms(rs[0].recorded_at), dep);
        assert.equal(ms(rs.at(-1).recorded_at), arr);
        const lr = c.legacy.get(g.shipment_id) ?? [];
        if (g.issue_type === 'MISSING_DATA') assert.equal(lr.length, 0);
        else assert.equal(lr[0].reported_status, 'PASS');
        break;
      }
      case 'LOGGER_NOT_ASSIGNED': {
        const covering = (c.assigns.get(g.shipment_id) ?? []).filter((a) => ms(a.assigned_from) <= dep && ms(a.assigned_to) >= arr);
        assert.equal(covering.length, 0);
        assert.ok(['DELETED', 'WINDOW_TRUNCATED'].includes(g.variant));
        if (g.variant === 'WINDOW_TRUNCATED') assert.ok(arr - ms(c.assigns.get(g.shipment_id)[0].assigned_to) >= 4 * 3600000);
        else assert.ok(c.t.temperature_reading.some((r) => r.logger_assignment_id === null && ms(r.recorded_at) >= dep && ms(r.recorded_at) <= arr));
        break;
      }
      case 'POLICY_MISMATCH':
        assert.ok(p.product_id !== s.product_id || ms(p.effective_from) > dep || (p.effective_to && ms(p.effective_to) <= dep));
        break;
      case 'CUSTODY_GAP': {
        const ev = [...c.cust.get(g.shipment_id)].sort((a, b) => a.event_sequence - b.event_sequence);
        let broken = ev[0].event_type !== 'PICKUP' || ev.at(-1).event_type !== 'DELIVERY';
        ev.forEach((e, i) => { if (!e.to_party_id || e.event_sequence !== i + 1 || (i && ev[i - 1].to_party_id !== e.from_party_id)) broken = true; });
        assert.ok(broken);
        break;
      }
      case 'TEMPERATURE_EXCURSION': {
        const m = outMinutes(rs, p);
        assert.ok(m > A);
        assert.equal(Number(g.expected_excursion_minutes), m);
        break;
      }
      case 'EXCURSION_WITHIN_ALLOWANCE': {
        const m = outMinutes(rs, p);
        assert.ok(m > 0 && m <= A);
        assert.equal(Number(g.expected_excursion_minutes), m);
        assert.ok(c.t.excursion_report.some((x) => x.shipment_id === g.shipment_id && x.source === 'LEGACY_IMPORT'));
        break;
      }
      case 'BOUNDARY_AT_LIMIT': {
        const u = rs[0].calibration_uncertainty_c;
        const hi = Math.round((p.max_temp_c - u) * 100) / 100, lo = Math.round((p.min_temp_c + u) * 100) / 100;
        assert.ok(rs.filter((r) => r.temperature_c === hi || r.temperature_c === lo).length >= 3);
        assert.equal(outMinutes(rs, p), 0);
        break;
      }
      case 'CALIBRATION_MARGINAL': {
        const u = rs[0].calibration_uncertainty_c;
        const marg = rs.filter((r) => (r.temperature_c > p.max_temp_c - u && r.temperature_c < p.max_temp_c)
          || (r.temperature_c < p.min_temp_c + u && r.temperature_c > p.min_temp_c));
        assert.ok(marg.length * 10 > A);
        assert.equal(outMinutes(rs, p), 0);
        break;
      }
      case 'CALIBRATION_EXPIRED': {
        const lg = c.assigns.get(g.shipment_id)[0].logger_id;
        const cals = c.t.logger_calibration.filter((x) => x.logger_id === lg);
        assert.ok(cals.every((x) => ms(x.expires_on) + 86400000 <= dep));
        assert.ok(dep >= ms('2026-03-01T00:00:00Z'));
        break;
      }
      case 'ROUTE_DEVIATION': {
        const st = c.stops.get(g.shipment_id);
        const seen = {
          MISSING_STOP: st.some((x) => x.stop_type === 'TRANSIT' && x.stop_sequence !== null && x.actual_arrival === null),
          UNEXPECTED_STOP: st.some((x) => x.stop_sequence === null && x.actual_arrival !== null),
          SEQUENCE: (() => {
            const pl = st.filter((x) => x.stop_sequence !== null && x.actual_sequence !== null).sort((a, b) => a.stop_sequence - b.stop_sequence);
            return pl.some((x, i) => i && x.actual_sequence < pl[i - 1].actual_sequence);
          })(),
          EXCESS_DWELL: st.some((x) => x.actual_departure && (ms(x.actual_departure) - ms(x.actual_arrival)) / MIN > p.max_dwell_minutes),
        };
        assert.ok(seen[g.variant], g.variant);
        break;
      }
      default: break;
    }
  }
});

test('c3: cross-shipment pairs', () => {
  const c = ctx(big);
  const firsts = big.groundTruth.filter((g) => g.issue_type === 'CROSS_SHIPMENT_EXCURSION' && g.variant === 'FIRST');
  assert.ok(firsts.length >= 1);
  for (const g of firsts) {
    const a = c.ship.get(g.shipment_id), b = c.ship.get(g.related_shipment_id);
    assert.equal(big.groundTruth.find((x) => x.shipment_id === b.shipment_id).related_shipment_id, a.shipment_id);
    const p = c.limits(a.shipment_id), A = p.max_excursion_minutes;
    const asA = c.assigns.get(a.shipment_id)[0], asB = c.assigns.get(b.shipment_id)[0];
    assert.equal(asA.logger_id, asB.logger_id);
    assert.equal(ms(b.departure_time), ms(a.arrival_time) + 10 * MIN);
    assert.ok(ms(asA.assigned_to) < ms(asB.assigned_from));
    assert.ok(ms(asA.assigned_from) <= ms(a.departure_time) && ms(asA.assigned_to) >= ms(a.arrival_time));
    assert.ok(ms(asB.assigned_from) <= ms(b.departure_time) && ms(asB.assigned_to) >= ms(b.arrival_time));
    const ra = c.readings(a.shipment_id), rb = c.readings(b.shipment_id);
    let kA = 0; while (kA < ra.length && isOut(ra[ra.length - 1 - kA], p)) kA++;
    let kB = 0; while (kB < rb.length && isOut(rb[kB], p)) kB++;
    assert.ok(kA >= 2 && kB >= 2);
    assert.ok(kA * 10 <= A && kB * 10 <= A);
    assert.ok((kA + kB) * 10 > A);
    assert.equal(ra.filter((r) => isOut(r, p)).length, kA); // no other OUT readings
    assert.equal(rb.filter((r) => isOut(r, p)).length, kB);
    const mine = c.t.excursion_report.find((x) => x.issue_type === 'CROSS_SHIPMENT_REPORT' && x.shipment_id === a.shipment_id);
    assert.ok(mine && mine.source === 'LEGACY_IMPORT');
    assert.ok(ms(mine.start_time) >= ms(a.departure_time) && ms(mine.start_time) <= ms(a.arrival_time));
    assert.ok(ms(mine.end_time) >= ms(b.departure_time) && ms(mine.end_time) <= ms(b.arrival_time));
    assert.equal(mine.duration_minutes, (kA + kB) * 10);
  }
});

test('d: isolation - untargeted shipments are byte-identical to the all-NONE plan', () => {
  const plain = generateDataset({ seed: SEED, plan: Array(200).fill('NONE') });
  const targeted = new Set(big.groundTruth.filter((g) => g.issue_type !== 'NONE').map((g) => g.shipment_id));
  assert.ok(targeted.size > 20 && targeted.size < 200);
  for (const t of ['party', 'product', 'lot', 'packaging', 'logger', 'logger_calibration', 'threshold_policy']) {
    assert.equal(JSON.stringify(big.tables[t]), JSON.stringify(plain.tables[t]), t);
  }
  const key = (ds) => {
    const aToS = new Map(ds.tables.logger_assignment.map((a) => [a.logger_assignment_id, a.shipment_id]));
    const m = new Map();
    for (const [t, rows] of Object.entries(ds.tables)) {
      for (const r of rows) {
        const sid = r.shipment_id ?? aToS.get(r.logger_assignment_id) ?? null;
        if (!sid) continue;
        if (!m.has(sid)) m.set(sid, []);
        m.get(sid).push(t + JSON.stringify(r));
      }
    }
    return m;
  };
  const km = key(big), kp = key(plain);
  let compared = 0;
  for (const g of big.groundTruth) {
    if (targeted.has(g.shipment_id)) continue;
    assert.deepEqual(km.get(g.shipment_id), kp.get(g.shipment_id), g.shipment_id);
    compared++;
  }
  assert.ok(compared > 100);
});

test('e: determinism incl. ground_truth.csv', () => {
  const f1 = renderFiles(generateDataset({ seed: SEED, mix: 'each' }));
  const f2 = renderFiles(generateDataset({ seed: SEED, mix: 'each' }));
  assert.ok('ground_truth.csv' in f1);
  for (const k of Object.keys(f1)) assert.equal(sha(f1[k]), sha(f2[k]), k);
});

test('f: no ground-truth leakage', () => {
  const { tables: schema } = parseSchema();
  for (const [t, def] of Object.entries(schema)) {
    for (const col of def.columns) {
      assert.ok(!col.name.startsWith('ground_truth'), `${t}.${col.name}`);
      if (col.name === 'issue_type') assert.equal(t, 'excursion_report'); // allowed detected-issue field
    }
  }
  assert.ok(!('ground_truth' in big.tables));
  const dir = new URL('../../generator/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'validateData.js')) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/(readFile|createReadStream|readdir)[^;\n]*ground_truth/.test(src), `${f} reads ground truth`);
    assert.ok(!/import[^;\n]*validateData/.test(src), `${f} imports the validator`);
  }
});
