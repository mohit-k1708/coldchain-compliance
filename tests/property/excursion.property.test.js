import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../generator/prng.js';
import { evaluateTemperature } from '../../engine/evaluators/temperature.js';
import { detectMissingReadings } from '../../engine/evaluators/gaps.js';

const MIN = 60000;
const BASE = Date.parse('2026-05-01T00:00:00Z');
const INTERVAL = 10;

// ---- independent oracle (different method: 1-minute cells, not run segmentation) ----------------------------
// times: minutes relative to BASE; temps/lo/hi/u: integer hundredths of a degree (exact arithmetic).
function classify(t, lo, hi, u) {
  if (t < lo - u || t > hi + u) return 'OUT';
  if (t >= lo + u && t <= hi - u) return 'IN';
  return 'MARGINAL';
}
function oracleOut({ times, temps, lo, hi, u, gap, dep, arr }, countMarginal) {
  const cells = new Uint8Array(Math.max(0, arr - dep));
  times.forEach((t, i) => {
    const c = classify(temps[i], lo, hi, u);
    if (!(c === 'OUT' || (countMarginal && c === 'MARGINAL'))) return;
    const n = i + 1 < times.length ? times[i + 1] : null;
    const holdEnd = Math.min(n !== null && n - t <= gap ? n : t + INTERVAL, arr);
    for (let m = t; m < holdEnd; m++) cells[m - dep] = 1;
  });
  let minutes = 0, components = 0;
  for (let k = 0; k < cells.length; k++) { if (cells[k]) { minutes++; if (k === 0 || !cells[k - 1]) components++; } }
  return { minutes, components };
}
function bruteForceGaps({ times, gap, dep, arr }) {
  const point = new Set([dep, arr, ...times]);
  const gaps = [];
  let prev = dep;
  for (let m = dep; m <= arr; m++) {
    if (!point.has(m)) continue;
    if (m - prev > gap) gaps.push([prev, m]);
    prev = m;
  }
  return gaps;
}

function makeCase(rng) {
  const n = rng.int(2, 60);
  const times = [];
  let pos = rng.int(0, 5);
  for (let k = 0; k < n; k++) { times.push(pos * INTERVAL); pos += 1 + (rng.chance(0.2) ? rng.int(1, 8) : 0); } // random omissions incl. long gaps
  const lo = rng.int(-2500, 500), hi = lo + rng.int(300, 1500), u = rng.int(0, 60);
  const temps = times.map(() => {
    const r = rng.next();
    if (r < 0.3) return rng.int(lo + u, hi - u);
    return r < 0.65 ? hi + rng.int(-90, 90) : lo + rng.int(-90, 90); // values spread around the limits
  });
  const dep = times[0] - (rng.chance(0.5) ? 0 : rng.int(0, 6) * 5);
  const arr = times[n - 1] + (rng.chance(0.5) ? 0 : rng.int(0, 6) * 5);
  return { times, temps, lo, hi, u, gap: rng.int(1, 4) * 10, dep, arr };
}

test('engine excursion minutes, run counts and gaps equal an independent oracle on 2,000 random cases', () => {
  const rng = createRng(20261022);
  let totalRuns = 0, casesWithGap = 0, casesWithMarginalOnly = 0;
  for (let i = 0; i < 2000; i++) {
    const c = makeCase(rng);
    const readings = c.times.map((t, k) => ({ reading_id: `R${i}-${k}`, t: BASE + t * MIN, temperature_c: c.temps[k] / 100, calibration_uncertainty_c: c.u / 100 }));
    const policy = { min_temp_c: c.lo / 100, max_temp_c: c.hi / 100, max_excursion_minutes: 30, max_data_gap_minutes: c.gap, sampling_interval_minutes: INTERVAL };
    const eng = evaluateTemperature(readings, policy, { arrivalMs: BASE + c.arr * MIN });
    const conf = oracleOut(c, false), poss = oracleOut(c, true);
    assert.equal(eng.confirmed_out_minutes, conf.minutes, `case ${i} confirmed minutes`);
    assert.equal(eng.possible_out_minutes, poss.minutes, `case ${i} possible minutes`);
    assert.equal(eng.confirmed.filter((r) => r.duration_minutes > 0).length, conf.components, `case ${i} confirmed run count`);
    assert.equal(eng.possible.filter((r) => r.duration_minutes > 0).length, poss.components, `case ${i} possible run count`);
    totalRuns += conf.components;
    if (poss.minutes > conf.minutes) casesWithMarginalOnly++;

    const gaps = detectMissingReadings(readings, { depMs: BASE + c.dep * MIN, arrMs: BASE + c.arr * MIN, samplingMin: INTERVAL, maxGapMin: c.gap });
    const want = bruteForceGaps(c);
    assert.deepEqual(gaps.gaps.map((g) => [(Date.parse(g.from) - BASE) / MIN, (Date.parse(g.to) - BASE) / MIN]), want, `case ${i} gaps`);
    assert.equal(gaps.finding.result === 'INDETERMINATE', want.length > 0, `case ${i} gap verdict`);
    if (want.length) casesWithGap++;
  }
  // make sure the random cases actually exercised the interesting paths
  assert.ok(totalRuns > 1000, `runs exercised: ${totalRuns}`);
  assert.ok(casesWithGap > 200, `cases with gaps: ${casesWithGap}`);
  assert.ok(casesWithMarginalOnly > 100, `cases where marginal matters: ${casesWithMarginalOnly}`);
});
