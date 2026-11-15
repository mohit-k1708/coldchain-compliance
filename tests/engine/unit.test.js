import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAll } from '../../engine/index.js';
import { classifyReading, detectExcursions } from '../../engine/evaluators/temperature.js';
import { build, every10, pick, at, AS_OF, BASE } from './fixture.js';

const run = (spec) => evaluateAll(build(spec), { asOf: AS_OF });
const one = (spec, n = 1) => pick(run(spec), n);
const r10 = (temps, extra = {}) => ({ n: 1, dep: 0, arr: (temps.length - 1) * 10, readings: every10(0, (temps.length - 1) * 10, temps), ...extra });
const IN = 5, OUT = 9;

test('a: reading classification', () => {
  const cls = (t, u) => classifyReading({ temperature_c: t, calibration_uncertainty_c: u }, { min_temp_c: 2, max_temp_c: 8 });
  assert.equal(cls(8.0, 0), 'IN');
  assert.equal(cls(8.1, 0), 'OUT');
  assert.equal(cls(2.0, 0), 'IN');
  assert.equal(cls(1.9, 0), 'OUT');
  assert.equal(cls(7.6, 0.5), 'MARGINAL');
  assert.equal(cls(8.6, 0.5), 'OUT');
  assert.equal(cls(7.4, 0.5), 'IN');
});

test('b: statement example 10:20 start, 10:40 end, 20 min; allowance decides', () => {
  const temps = [5, 6, 9, 10, 7];
  const ok = one({ shipments: [r10(temps)] });
  const run0 = ok.json('R-TEMP-03').runs[0];
  assert.equal(run0.start, at(20));
  assert.equal(run0.end, at(40));
  assert.equal(run0.duration_minutes, 20);
  assert.equal(ok.status, 'COMPLIANT');
  const bad = one({ policy: { allowance: 10 }, shipments: [r10(temps)] });
  assert.equal(bad.status, 'NON_COMPLIANT');
  assert.equal(bad.one('R-TEMP-03').result, 'FAIL');
});

test('c: single OUT = 10 min; run at window end capped at arrival; cumulative runs', () => {
  assert.equal(one({ shipments: [r10([5, 9, 5, 5, 5])] }).json('R-TEMP-03').confirmed_out_minutes, 10);
  const capped = one({ shipments: [r10([5, 5, 5, 9, 9])] }).json('R-TEMP-03');
  assert.equal(capped.runs[0].duration_minutes, 10); // 10:30..arrival 10:40, not 10:50
  assert.equal(capped.runs[0].end, at(40));
  const two = one({ shipments: [r10([5, 9, 9, 5, 5, 5, 9, 9, 5, 5, 5])] });
  assert.deepEqual(two.json('R-TEMP-03').runs.map((r) => r.duration_minutes), [20, 20]);
  assert.equal(two.json('R-TEMP-03').confirmed_out_minutes, 40);
  assert.equal(two.status, 'NON_COMPLIANT'); // each run <= 30, cumulative 40 > 30
});

test('d: a run is not extended across a data gap', () => {
  const r = one({ shipments: [{ n: 1, dep: 0, arr: 50, readings: [[0, IN], [10, OUT], [50, IN]] }] });
  assert.equal(r.json('R-TEMP-03').runs[0].duration_minutes, 10); // ends at 10:20, not 10:50
  assert.equal(r.one('R-GAP-01').result, 'INDETERMINATE');
  const direct = detectExcursions([
    { reading_id: 'a', t: 0, temperature_c: 9, calibration_uncertainty_c: 0 },
    { reading_id: 'b', t: 40 * 60000, temperature_c: 5, calibration_uncertainty_c: 0 }],
  { min_temp_c: 2, max_temp_c: 8, max_data_gap_minutes: 20, sampling_interval_minutes: 10 }, {});
  assert.equal(direct[0].duration_minutes, 10);
});

test('e: missing data example (10:00, 10:10, 10:40)', () => {
  const spec = (gap) => ({ policy: { gap }, shipments: [{ n: 1, dep: 0, arr: 40, readings: [[0, 5], [10, 6], [40, 7]] }] });
  const strict = one(spec(20));
  assert.deepEqual(strict.json('R-GAP-01').missing_samples, [at(20), at(30)]);
  assert.equal(strict.json('R-GAP-01').missing_sample_count, 2);
  assert.equal(strict.one('R-GAP-01').result, 'INDETERMINATE');
  assert.equal(strict.status, 'INDETERMINATE');
  assert.equal(strict.json('R-TEMP-03').confirmed_out_minutes, 0); // gap minutes are not "in range" evidence
  const lax = one(spec(30));
  assert.equal(lax.one('R-GAP-01').result, 'WARNING');
  assert.equal(lax.json('R-GAP-01').missing_sample_count, 2);
  assert.equal(lax.status, 'COMPLIANT');
});

test('f: ISOLATION - touching assignments on one logger are never merged into one run', () => {
  const a = { n: 1, dep: 0, arr: 40, assign: { from: -30, to: 40 }, readings: [[0, IN], [10, IN], [20, OUT], [30, OUT], [40, OUT]] };
  const b = { n: 2, dep: 50, arr: 90, assign: { from: 50, to: 120 }, readings: [[50, OUT], [60, OUT], [70, IN], [80, IN], [90, IN]] };
  const out = run({ shipments: [a, b] });
  assert.equal(pick(out, 1).status, 'COMPLIANT');
  assert.equal(pick(out, 2).status, 'COMPLIANT');
  assert.equal(pick(out, 1).json('R-TEMP-03').confirmed_out_minutes, 20);
  assert.equal(pick(out, 2).json('R-TEMP-03').confirmed_out_minutes, 20);
  // the trap: a naive per-logger stream would produce one long run
  const stream = [...a.readings, ...b.readings].sort((x, y) => x[0] - y[0])
    .map(([m, t]) => ({ reading_id: `r${m}`, t: BASE + m * 60000, temperature_c: t, calibration_uncertainty_c: 0 }));
  const naive = detectExcursions(stream, { min_temp_c: 2, max_temp_c: 8, max_data_gap_minutes: 20, sampling_interval_minutes: 10 }, {});
  assert.equal(naive.length, 1);
  assert.ok(naive[0].duration_minutes > 30, `naive run ${naive[0].duration_minutes} min`);
});

test('g: marginal readings -> INDETERMINATE when possible exceeds allowance', () => {
  const r = one({ u: 0.5, shipments: [r10(Array(8).fill(7.6))] });
  assert.equal(r.json('R-TEMP-03').confirmed_out_minutes, 0);
  assert.ok(r.json('R-TEMP-04').possible_out_minutes > 30);
  assert.equal(r.one('R-TEMP-04').result, 'INDETERMINATE');
  assert.equal(r.status, 'INDETERMINATE');
});

test('h: the five mandatory cases', () => {
  const good = [5, 5, 5, 5, 5];
  // 1 logger not assigned
  const h1 = one({ shipments: [r10(good, { assign: false })] });
  assert.equal(h1.status, 'INDETERMINATE');
  assert.equal(h1.one('R-LOG-02').result, 'INDETERMINATE');
  // 2 policy mismatch (policy of another product)
  const h2 = one({ shipments: [r10(good, { policyId: 'POL-000002' })] });
  assert.equal(h2.status, 'INDETERMINATE');
  assert.equal(h2.one('R-POL-01').result, 'INDETERMINATE');
  assert.equal(h2.run.policy_id, 'POL-000001'); // evaluated against the correct policy
  // 3 missing data silently passed
  const h3 = one({ shipments: [{ n: 1, dep: 0, arr: 40, readings: [[0, 5], [10, 5], [40, 5]], legacy: 'PASS' }] });
  assert.equal(h3.status, 'INDETERMINATE');
  assert.equal(h3.one('R-GAP-01').result, 'INDETERMINATE');
  assert.equal(h3.one('R-SILENT-01').result, 'WARNING');
  // 4 custody gap (handover record missing: chain breaks)
  const h4 = one({ shipments: [r10(good, { custody: [[1, 'PICKUP', 'PTY-000001', 'PTY-000002', 0], [3, 'DELIVERY', 'PTY-000004', 'PTY-000003', 40]] })] });
  assert.equal(h4.status, 'INDETERMINATE');
  assert.equal(h4.one('R-CUS-01').result, 'INDETERMINATE');
  // 5 cross-shipment: legacy report spills outside this shipment's window
  const h5 = one({ shipments: [r10(good, { legacyExc: [{ start: 30, end: 60 }] })] });
  assert.equal(h5.status, 'COMPLIANT');
  assert.equal(h5.one('R-ISO-01').result, 'WARNING');
  assert.equal(JSON.parse(h5.one('R-ISO-01').detail_json).issue_type, 'CROSS_SHIPMENT_REPORT');
});

test('i: expired calibration, overlapping assignments, duplicate custody, non-GOOD readings', () => {
  const good = [5, 5, 5, 5, 5];
  const cal = one({ shipments: [r10(good, { calib: { on: '2025-01-01', expires: '2026-03-09' } })] });
  assert.equal(cal.one('R-LOG-03').result, 'INDETERMINATE');
  assert.equal(cal.status, 'INDETERMINATE');
  const ov = one({ shipments: [r10(good)], extraAssignments: [{ logger_assignment_id: 'LOG-SHP-2026-000009-01', shipment_id: 'SHP-2026-000009', from: 10, to: 60 }] });
  assert.equal(ov.one('R-LOG-04').result, 'INDETERMINATE');
  assert.equal(ov.status, 'INDETERMINATE');
  const dup = one({ shipments: [r10(good, { custody: [[1, 'PICKUP', 'PTY-000001', 'PTY-000002', 0], [2, 'PICKUP', 'PTY-000001', 'PTY-000002', 0], [3, 'DELIVERY', 'PTY-000002', 'PTY-000003', 40]] })] });
  assert.equal(dup.one('R-CUS-02').result, 'WARNING');
  assert.equal(dup.status, 'COMPLIANT');
  const bad = one({ shipments: [{ n: 1, dep: 0, arr: 40, readings: [[0, 5], [10, 5, 'SUSPECT'], [20, 5, 'SUSPECT'], [30, 5], [40, 5]] }] });
  assert.equal(bad.one('R-GAP-01').result, 'INDETERMINATE'); // non-GOOD readings count as missing
  assert.equal(bad.json('R-WIN-01').non_good_excluded, 2);
});
