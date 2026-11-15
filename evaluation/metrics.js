// Pure metric functions. A metric that cannot be computed (zero denominator) is null and rendered as "N/A".
export const CLASSES = ['COMPLIANT', 'NON_COMPLIANT', 'INDETERMINATE'];

export const ratio = (num, den) => (den === 0 ? null : num / den);
export const fmt = (x, digits = 4) => (x === null || x === undefined ? 'N/A' : Number.isInteger(x) && digits === 0 ? String(x) : x.toFixed(digits));
export const pct = (x) => (x === null || x === undefined ? 'N/A' : `${(x * 100).toFixed(2)}%`);

// pairs: [{expected, actual}] -> matrix[expected][actual]
export function confusionMatrix(pairs, classes = CLASSES) {
  const m = Object.fromEntries(classes.map((e) => [e, Object.fromEntries(classes.map((a) => [a, 0]))]));
  for (const { expected, actual } of pairs) if (m[expected] && m[expected][actual] !== undefined) m[expected][actual]++;
  return m;
}
export const total = (m) => Object.values(m).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0);
export const accuracy = (m) => ratio(Object.keys(m).reduce((s, c) => s + m[c][c], 0), total(m));

export function f1Of(p, r) {
  if (p === null || r === null) return null;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
export function classMetrics(m) {
  const cls = Object.keys(m);
  const out = {};
  for (const c of cls) {
    const tp = m[c][c];
    const support = cls.reduce((s, a) => s + m[c][a], 0); // row sum = expected c
    const predicted = cls.reduce((s, e) => s + m[e][c], 0); // column sum = predicted c
    const precision = ratio(tp, predicted), recall = ratio(tp, support);
    out[c] = { tp, fp: predicted - tp, fn: support - tp, support, precision, recall, f1: f1Of(precision, recall) };
  }
  return out;
}
// macro average over the classes whose F1 is defined
export function macroF1(cm) {
  const defined = Object.values(cm).map((x) => x.f1).filter((x) => x !== null);
  return defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : null;
}

// ---- row-level metrics ----------------------------------------------------------------------------------
// row: { shipment_id, label, variant, expected_decision, expected_rule, expected_excursion_minutes, expected_gap_minutes,
//        related_shipment_id, actual_status, findings:[{rule_code,result}], actual_excursion_minutes, actual_gap_minutes }
const nonPass = (f) => f.result !== 'PASS';
export const hasRule = (row, rule, { any = false } = {}) => row.findings.some((f) => f.rule_code === rule && (any || nonPass(f)));
export function detected(row) {
  if (row.actual_status !== row.expected_decision) return false;
  return row.expected_rule.split('+').filter((r) => r && r !== 'ALL_RULES_PASS').every((r) => hasRule(row, r, { any: r === 'R-ISO-01' }));
}

export function perLabel(rows) {
  const out = {};
  for (const r of rows) {
    const o = (out[r.label] ??= { count: 0, detected: 0, correct_status: 0, row: Object.fromEntries(CLASSES.map((c) => [c, 0])) });
    o.count++;
    if (detected(r)) o.detected++;
    if (r.actual_status === r.expected_decision) o.correct_status++;
    if (o.row[r.actual_status] !== undefined) o.row[r.actual_status]++;
  }
  for (const o of Object.values(out)) { o.detection_rate = ratio(o.detected, o.count); o.status_accuracy = ratio(o.correct_status, o.count); }
  return out;
}

export const DRIVER_RULES = ['R-TEMP-03', 'R-TEMP-04', 'R-GAP-01', 'R-LOG-02', 'R-LOG-03', 'R-POL-01', 'R-CUS-01',
  'R-ROUTE-01', 'R-ROUTE-02', 'R-ROUTE-03', 'R-ROUTE-04', 'R-ROUTE'];
export function ruleMetrics(rows, rules = DRIVER_RULES) {
  const match = (code, rule) => (rule === 'R-ROUTE' ? code.startsWith('R-ROUTE-') : code === rule);
  const out = {};
  for (const rule of rules) {
    let tp = 0, fired = 0, expected = 0;
    for (const r of rows) {
      const f = r.findings.some((x) => match(x.rule_code, rule) && nonPass(x));
      const e = r.expected_rule.split('+').some((x) => match(x, rule));
      if (f) fired++;
      if (e) expected++;
      if (f && e) tp++;
    }
    const precision = ratio(tp, fired), recall = ratio(tp, expected);
    out[rule] = { fired, expected, tp, precision, recall, f1: f1Of(precision, recall) };
  }
  return out;
}

export function namedRates(rows) {
  const of = (...labels) => rows.filter((r) => labels.includes(r.label));
  const rate = (num, den) => ({ num, den, rate: ratio(num, den) });
  const expCompliant = rows.filter((r) => r.expected_decision === 'COMPLIANT');
  const te = of('TEMPERATURE_EXCURSION');
  const md = of('MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED');
  const sp = of('MISSING_DATA_SILENTLY_PASSED');
  const lm = of('LOGGER_NOT_ASSIGNED', 'CALIBRATION_EXPIRED');
  // cross-shipment: judged per pair (both COMPLIANT and the first shipment's legacy report flagged with R-ISO-01)
  const byId = new Map(rows.map((r) => [r.shipment_id, r]));
  const firsts = of('CROSS_SHIPMENT_EXCURSION').filter((r) => r.variant === 'FIRST');
  const crossOk = firsts.filter((a) => {
    const b = byId.get(a.related_shipment_id);
    return a.actual_status === 'COMPLIANT' && b && b.actual_status === 'COMPLIANT' && hasRule(a, 'R-ISO-01');
  }).length;
  return {
    false_positive_rate: rate(expCompliant.filter((r) => r.actual_status !== 'COMPLIANT').length, expCompliant.length),
    missed_excursion_rate: rate(te.filter((r) => r.actual_status !== 'NON_COMPLIANT').length, te.length),
    missing_data_detection_rate: rate(md.filter((r) => hasRule(r, 'R-GAP-01')).length, md.length),
    silent_pass_detection_rate: rate(sp.filter((r) => hasRule(r, 'R-SILENT-01')).length, sp.length),
    custody_gap_detection_rate: rate(of('CUSTODY_GAP').filter(detected).length, of('CUSTODY_GAP').length),
    logger_mismatch_detection_rate: rate(lm.filter(detected).length, lm.length),
    policy_mismatch_detection_rate: rate(of('POLICY_MISMATCH').filter(detected).length, of('POLICY_MISMATCH').length),
    cross_shipment_isolation_rate: rate(crossOk, firsts.length),
    route_deviation_detection_rate: rate(of('ROUTE_DEVIATION').filter(detected).length, of('ROUTE_DEVIATION').length),
  };
}

export const RATE_TITLES = {
  false_positive_rate: 'False positive rate', missed_excursion_rate: 'Missed excursion rate',
  missing_data_detection_rate: 'Missing-data detection rate', silent_pass_detection_rate: 'Silent-pass detection rate',
  custody_gap_detection_rate: 'Custody-gap detection rate', logger_mismatch_detection_rate: 'Logger mismatch detection rate',
  policy_mismatch_detection_rate: 'Policy mismatch detection rate', cross_shipment_isolation_rate: 'Cross-shipment isolation rate',
  route_deviation_detection_rate: 'Route deviation detection rate',
};

export function durationAccuracy(rows) {
  const stat = (pairs) => {
    const n = pairs.length, exact = pairs.filter(([e, a]) => a !== null && e === a).length;
    const errs = pairs.filter(([, a]) => a !== null).map(([e, a]) => Math.abs(e - a));
    return { n, exact, exact_rate: ratio(exact, n), mae: errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : null };
  };
  return {
    excursion_minutes: stat(rows.filter((r) => r.expected_excursion_minutes !== null).map((r) => [r.expected_excursion_minutes, r.actual_excursion_minutes])),
    gap_minutes: stat(rows.filter((r) => r.expected_gap_minutes !== null).map((r) => [r.expected_gap_minutes, r.actual_gap_minutes])),
  };
}

export function computeAll(rows) {
  const confusion = confusionMatrix(rows.map((r) => ({ expected: r.expected_decision, actual: r.actual_status })));
  const classes = classMetrics(confusion);
  return { n: rows.length, confusion, accuracy: accuracy(confusion), classes, macro_f1: macroF1(classes), per_label: perLabel(rows),
    rules: ruleMetrics(rows), named_rates: namedRates(rows), duration: durationAccuracy(rows) };
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
// Join ground-truth rows with engine output rows (compliance_run + compliance_finding).
export function joinRows(groundTruth, runs, findings) {
  const runBy = new Map(runs.map((r) => [r.shipment_id, r]));
  const fByRun = new Map();
  for (const f of findings) { if (!fByRun.has(f.compliance_run_id)) fByRun.set(f.compliance_run_id, []); fByRun.get(f.compliance_run_id).push(f); }
  return groundTruth.map((g) => {
    const run = runBy.get(g.shipment_id);
    const fs = run ? fByRun.get(run.compliance_run_id) ?? [] : [];
    const json = (code) => { const f = fs.find((x) => x.rule_code === code); try { return f ? JSON.parse(f.detail_json) : null; } catch { return null; } };
    const t3 = json('R-TEMP-03'), g1 = json('R-GAP-01');
    return {
      shipment_id: g.shipment_id, label: g.issue_type, variant: g.variant ?? '', expected_decision: g.expected_decision,
      expected_rule: g.expected_rule, expected_excursion_minutes: num(g.expected_excursion_minutes), expected_gap_minutes: num(g.expected_gap_minutes),
      related_shipment_id: g.related_shipment_id ?? '', actual_status: run ? run.compliance_status : 'MISSING',
      findings: fs.map((f) => ({ rule_code: f.rule_code, result: f.result })),
      actual_excursion_minutes: t3 ? t3.confirmed_out_minutes : null,
      actual_gap_minutes: g1 && g1.gaps && g1.gaps.length ? Math.max(...g1.gaps.map((x) => x.minutes)) : null,
    };
  });
}
