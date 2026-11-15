import { ms, iso, MIN } from './time.js';
import { evaluateTemperature } from './evaluators/temperature.js';
import { detectMissingReadings } from './evaluators/gaps.js';
import { validateLoggerAssignment, validateCalibration, detectOverlap, checkReadingAssignmentConsistency } from './evaluators/logger.js';
import { selectPolicy, validatePolicy } from './evaluators/policy.js';
import { evaluateRoute } from './evaluators/route.js';
import { evaluateCustody } from './evaluators/custody.js';
import { evaluateLots } from './evaluators/lot.js';
import { evaluatePackaging } from './evaluators/packaging.js';
import { evaluateLegacyExcursions, evaluateSilentPass } from './evaluators/legacy.js';
import { severityFor } from './severity.js';

export const ENGINE_VERSION = 'engine-1.0.0';

// Which finding explains the decision first when several apply.
const DECIDE_ORDER = ['R-TEMP-03', 'R-ROUTE-01', 'R-ROUTE-02', 'R-ROUTE-03', 'R-ROUTE-04', 'R-LOG-02', 'R-LOG-03', 'R-LOG-04',
  'R-POL-01', 'R-GAP-01', 'R-TEMP-04', 'R-CUS-01', 'R-CUS-02', 'R-ROUTE-05', 'R-LOT-01', 'R-LOG-01'];

// R-WIN-01: readings come only from the shipment's own assignment windows, inside [departure, arrival].
function collectReadings(idx, assignments, depMs, arrMs, asOfMs) {
  const seen = new Set();
  const used = [];
  let nonGood = 0, late = 0;
  for (const a of assignments) {
    const from = Math.max(depMs, ms(a.assigned_from));
    const to = Math.min(arrMs, a.assigned_to ? ms(a.assigned_to) : Infinity);
    if (from > to) continue;
    for (const { t, row } of idx.windowReadings(a.logger_id, from, to)) {
      if (seen.has(row.reading_id)) continue;
      seen.add(row.reading_id);
      if (row.reading_quality !== 'GOOD') { nonGood++; continue; }
      if (ms(row.received_at) > asOfMs) { late++; continue; }
      used.push({ reading_id: row.reading_id, t, temperature_c: row.temperature_c,
        calibration_uncertainty_c: row.calibration_uncertainty_c, row, derivedAssignmentId: a.logger_assignment_id });
    }
  }
  used.sort((x, y) => x.t - y.t);
  return { used, nonGood, late };
}

// disabledRules is an EVALUATION HOOK (ablation studies): findings whose rule_code equals an entry, or starts with
// '<entry>-' (so 'R-ROUTE' disables R-ROUTE-01..05), are dropped before precedence is applied. Default: none.
export function calculateShipmentCompliance(idx, shipment, { asOfMs, disabledRules = [] }) {
  const findings = [];
  const push = (...fs) => { for (const f of fs) if (f) findings.push({ reading_ids: [], ...f }); };
  const depMs = ms(shipment.departure_time), arrMs = ms(shipment.arrival_time);
  const product = idx.productById.get(shipment.product_id) ?? null;
  const applied = idx.policyById.get(shipment.policy_id) ?? null;
  const correct = selectPolicy(idx.policiesByProduct.get(shipment.product_id), depMs);
  const policy = correct ?? applied;
  const assignments = (idx.assignmentsByShipment.get(shipment.shipment_id) ?? []).filter((a) => a.assignment_status !== 'CANCELLED')
    .sort((a, b) => ms(a.assigned_from) - ms(b.assigned_from));
  const lots = idx.lotsByShipment.get(shipment.shipment_id) ?? [];
  const stops = idx.stopsByShipment.get(shipment.shipment_id) ?? [];
  const custody = idx.custodyByShipment.get(shipment.shipment_id) ?? [];
  const legacyReports = idx.legacyReportsByShipment.get(shipment.shipment_id) ?? [];
  const legacyExc = (idx.excursionsByShipment.get(shipment.shipment_id) ?? []).filter((x) => x.source === 'LEGACY_IMPORT');
  const packaging = idx.packagingByShipment.get(shipment.shipment_id) ?? [];
  const loggers = [...new Set(assignments.map((a) => a.logger_id))].sort();
  const calibrations = loggers.flatMap((l) => idx.calibrationsByLogger.get(l) ?? []);
  const overlapRows = assignments.flatMap((a) => (idx.assignmentsByLogger.get(a.logger_id) ?? [])
    .filter((o) => o.logger_assignment_id !== a.logger_assignment_id && o.assignment_status !== 'CANCELLED'
      && ms(o.assigned_from) < arrMs && (o.assigned_to ? ms(o.assigned_to) : Infinity) > depMs));

  if (!policy) {
    push({ rule_code: 'R-POL-01', result: 'INDETERMINATE', detail: `no policy found for product ${shipment.product_id}`, detail_json: {}, issue_type: 'POLICY_MISMATCH' });
    return finish({ findings, policy: null, shipment, correct, applied, assignments, loggers, used: [], inputs: { shipment }, excursions: [], asOfMs, disabledRules });
  }

  // logger / window
  push(...validateLoggerAssignment(assignments, idx.loggerById, depMs, arrMs));
  push(validateCalibration(assignments, idx.calibrationsByLogger, depMs, arrMs));
  push(detectOverlap(assignments, idx.assignmentsByLogger, depMs, arrMs));
  const { used, nonGood, late } = collectReadings(idx, assignments, depMs, arrMs, asOfMs);
  push({ rule_code: 'R-WIN-01', result: 'PASS',
    detail: `${used.length} GOOD reading(s) inside departure..arrival and the assignment window(s); ${nonGood} non-GOOD and ${late} late-arriving reading(s) excluded`,
    detail_json: { used: used.length, non_good_excluded: nonGood, late_excluded: late, as_of: iso(asOfMs) } });
  push(checkReadingAssignmentConsistency(used));

  // data gaps
  const gaps = detectMissingReadings(used, { depMs, arrMs, samplingMin: policy.sampling_interval_minutes, maxGapMin: policy.max_data_gap_minutes });
  push(gaps.finding);

  // temperature (always against the CORRECT policy)
  const temp = evaluateTemperature(used, policy, { arrivalMs: arrMs });
  push(...temp.findings);

  // policy
  const tempOutcome = temp.findings[0].result === 'FAIL' ? `NON_COMPLIANT (${temp.findings[0].detail})`
    : temp.findings[1].result === 'INDETERMINATE' ? 'INDETERMINATE (marginal)' : 'temperature within limits';
  push(validatePolicy({ shipment, product, applied, correct, depMs, tempOutcome }));

  push(evaluateLots(lots, idx.lotById, shipment));
  push(evaluatePackaging(packaging, policy, shipment));
  push(...evaluateRoute(stops, policy));
  push(...evaluateCustody(custody, shipment));
  const leg = evaluateLegacyExcursions(legacyExc, temp.confirmed, depMs, arrMs);
  push(leg.iso, leg.dur);

  const inputs = {
    shipment, product, applied_policy: applied, correct_policy: correct, assignments, overlapping_assignments: overlapRows,
    readings: used.map((r) => [r.reading_id, r.row.recorded_at, r.row.received_at, r.temperature_c, r.calibration_uncertainty_c, r.row.reading_quality, r.row.logger_assignment_id]),
    calibrations, custody, stops, lots, packaging: packaging.map((p) => ({ ...p })), legacy_reports: legacyReports, legacy_excursions: legacyExc,
  };
  return finish({ findings, policy, shipment, correct, applied, assignments, loggers, used, inputs, gaps: gaps.gaps, temp, asOfMs, disabledRules });
}

function statusOf(findings) {
  if (findings.some((f) => f.result === 'FAIL')) return 'NON_COMPLIANT';
  if (findings.some((f) => f.result === 'INDETERMINATE')) return 'INDETERMINATE';
  return 'COMPLIANT';
}

function finish({ findings, policy, shipment, assignments, loggers, used, inputs, gaps = [], temp = null, asOfMs, disabledRules = [] }) {
  const off = (code) => disabledRules.some((d) => code === d || code.startsWith(`${d}-`));
  findings = findings.filter((f) => !off(f.rule_code));
  let status = statusOf(findings);
  const silent = evaluateSilentPass(inputs.legacy_reports ?? [], status);
  if (silent && !off(silent.rule_code)) findings.push({ reading_ids: [], ...silent });

  const wanted = status === 'NON_COMPLIANT' ? 'FAIL' : 'INDETERMINATE';
  const decisive = findings.filter((f) => f.result === wanted)
    .sort((a, b) => DECIDE_ORDER.indexOf(a.rule_code) - DECIDE_ORDER.indexOf(b.rule_code));
  const pol = policy ? ` (${policy.policy_id} v${policy.policy_version}, ${Number(policy.min_temp_c).toFixed(2)}-${Number(policy.max_temp_c).toFixed(2)} C)` : '';
  let reason;
  if (decisive.length) {
    const more = decisive.length > 1 ? `; also ${[...new Set(decisive.slice(1).map((f) => f.rule_code))].join(', ')}` : '';
    reason = `${status} [${decisive[0].rule_code}]: ${decisive[0].detail}${more}${pol}.`;
  } else {
    const warn = findings.filter((f) => f.result === 'WARNING');
    reason = `COMPLIANT: all ${findings.filter((f) => f.result === 'PASS').length} checks passed${warn.length ? `, ${warn.length} warning(s): ${[...new Set(warn.map((f) => f.rule_code))].join(', ')}` : ''}${pol}.`;
  }
  for (const f of findings) f.reading_ids = [...new Set(f.reading_ids)];

  // engine excursion drafts: one per temperature run, per gap, per failing/indeterminate finding with an issue type
  const A = policy?.max_excursion_minutes ?? 0;
  const excursions = [];
  const base = { logger_id: loggers[0] ?? null, logger_assignment_id: assignments[0]?.logger_assignment_id ?? null };
  if (temp) {
    const total = temp.confirmed_out_minutes;
    const dev = Math.max(0, ...temp.confirmed.map((r) => r.peak_deviation_c));
    for (const r of temp.confirmed) {
      excursions.push({ ...base, issue_type: r.issue_type, start_time: r.start_time, end_time: r.end_time, duration_minutes: r.duration_minutes,
        peak_temperature_c: r.peak_temperature_c, severity: severityFor({ deviation: r.peak_deviation_c, minutes: total, allowed: A, issue_type: r.issue_type }),
        reading_ids: r.reading_ids, rule_code: 'R-TEMP-03' });
    }
    void dev;
  }
  for (const g of gaps) {
    excursions.push({ ...base, issue_type: 'MISSING_DATA', start_time: g.from, end_time: g.to, duration_minutes: g.minutes, peak_temperature_c: null,
      severity: severityFor({ issue_type: 'MISSING_DATA' }), reading_ids: [g.from_reading_id, g.to_reading_id].filter(Boolean), rule_code: 'R-GAP-01' });
  }
  for (const f of findings) {
    if (!f.issue_type || f.rule_code === 'R-TEMP-03' || f.rule_code === 'R-GAP-01') continue;
    if (f.result !== 'FAIL' && f.result !== 'INDETERMINATE' && !(f.rule_code === 'R-ISO-01' && f.result === 'WARNING')) continue;
    excursions.push({ ...base, issue_type: f.issue_type, start_time: null, end_time: null, duration_minutes: null, peak_temperature_c: null,
      severity: f.severity ?? severityFor({ issue_type: f.issue_type }), reading_ids: f.reading_ids, rule_code: f.rule_code });
  }
  return { status, reason_summary: reason, policy, findings, excursions: excursions.filter((x) => !off(x.rule_code)), inputs };
}
