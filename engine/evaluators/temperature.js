import { cents, iso, MIN, round2 } from '../time.js';
import { severityFor } from '../severity.js';

// R-TEMP-01. Compared in integer hundredths so a reading exactly at a limit is never misclassified by float drift.
export function classifyReading(reading, policy) {
  const t = cents(reading.temperature_c), u = cents(reading.calibration_uncertainty_c ?? 0);
  const lo = cents(policy.min_temp_c), hi = cents(policy.max_temp_c);
  if (t < lo - u || t > hi + u) return 'OUT';
  if (t >= lo + u && t <= hi - u) return 'IN';
  return 'MARGINAL';
}

// R-TEMP-02. readings: [{reading_id, t(ms), temperature_c, calibration_uncertainty_c}] sorted by t.
export function detectExcursions(readings, policy, { arrivalMs = Infinity, treatMarginalAsOut = false } = {}) {
  const gapMs = policy.max_data_gap_minutes * MIN, stepMs = policy.sampling_interval_minutes * MIN;
  const cls = readings.map((r) => classifyReading(r, policy));
  const out = (i) => cls[i] === 'OUT' || (treatMarginalAsOut && cls[i] === 'MARGINAL');
  const runs = [];
  for (let i = 0; i < readings.length;) {
    if (!out(i)) { i++; continue; }
    let j = i;
    while (j + 1 < readings.length && out(j + 1) && readings[j + 1].t - readings[j].t <= gapMs) j++;
    const start = readings[i].t, last = readings[j].t, nx = readings[j + 1];
    let end = nx && !out(j + 1) && nx.t - last <= gapMs ? nx.t : last + stepMs; // never extended across a gap
    end = Math.max(start, Math.min(end, arrivalMs));
    let peak = readings[i], peakDev = -Infinity;
    for (let k = i; k <= j; k++) {
      const r = readings[k];
      const dev = Math.max(r.temperature_c - policy.max_temp_c, policy.min_temp_c - r.temperature_c);
      if (dev > peakDev) { peakDev = dev; peak = r; }
    }
    runs.push({
      start_ms: start, end_ms: end, start_time: iso(start), end_time: iso(end), duration_minutes: (end - start) / MIN,
      reading_ids: readings.slice(i, j + 1).map((r) => r.reading_id), peak_temperature_c: peak.temperature_c,
      peak_deviation_c: round2(Math.max(0, peakDev)),
      issue_type: peak.temperature_c > (policy.min_temp_c + policy.max_temp_c) / 2 ? 'TEMP_HIGH' : 'TEMP_LOW',
    });
    i = j + 1;
  }
  return runs;
}

const sum = (runs) => runs.reduce((s, r) => s + r.duration_minutes, 0);

// R-TEMP-03 / R-TEMP-04
export function evaluateTemperature(readings, policy, { arrivalMs }) {
  const A = policy.max_excursion_minutes;
  const confirmed = detectExcursions(readings, policy, { arrivalMs });
  const possible = detectExcursions(readings, policy, { arrivalMs, treatMarginalAsOut: true });
  const confirmedMin = sum(confirmed), possibleMin = sum(possible);
  const peakDev = Math.max(0, ...confirmed.map((r) => r.peak_deviation_c));
  const top = [...confirmed].sort((a, b) => b.duration_minutes - a.duration_minutes)[0];
  const runsJson = confirmed.map((r) => ({ start: r.start_time, end: r.end_time, duration_minutes: r.duration_minutes,
    peak_temperature_c: r.peak_temperature_c, peak_deviation_c: r.peak_deviation_c }));
  const fail = confirmedMin > A;
  const f3 = {
    rule_code: 'R-TEMP-03', result: fail ? 'FAIL' : 'PASS',
    detail: fail
      ? `confirmed excursion ${confirmedMin} min exceeds allowed ${A} min${confirmed.length > 1 ? ` (${confirmed.length} runs: ${confirmed.map((r) => r.duration_minutes).join('+')} min)` : ''}`
      : `confirmed excursion ${confirmedMin} min within allowed ${A} min`,
    detail_json: { confirmed_out_minutes: confirmedMin, allowed_minutes: A, runs: runsJson },
    reading_ids: confirmed.flatMap((r) => r.reading_ids),
    ...(top ? { issue_type: top.issue_type, severity: severityFor({ deviation: peakDev, minutes: confirmedMin, allowed: A, issue_type: top.issue_type }) } : {}),
  };
  const marginalIds = readings.filter((r) => classifyReading(r, policy) === 'MARGINAL').map((r) => r.reading_id);
  const indeterminate = !fail && possibleMin > A;
  const f4 = {
    rule_code: 'R-TEMP-04', result: indeterminate ? 'INDETERMINATE' : 'PASS',
    detail: indeterminate
      ? `confirmed excursion ${confirmedMin} min is within allowed ${A} min but possible excursion ${possibleMin} min (marginal readings within calibration uncertainty counted as OUT) exceeds it`
      : `possible excursion ${possibleMin} min does not change the decision (allowed ${A} min)`,
    detail_json: { confirmed_out_minutes: confirmedMin, possible_out_minutes: possibleMin, allowed_minutes: A, marginal_readings: marginalIds.length },
    reading_ids: indeterminate ? possible.flatMap((r) => r.reading_ids) : [],
    ...(indeterminate ? { issue_type: 'CALIBRATION_MARGINAL', severity: 'MEDIUM' } : {}),
  };
  return { findings: [f3, f4], confirmed, possible, confirmed_out_minutes: confirmedMin, possible_out_minutes: possibleMin };
}
