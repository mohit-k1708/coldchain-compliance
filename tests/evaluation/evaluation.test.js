import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset } from '../../generator/index.js';
import { evaluateAll } from '../../engine/index.js';
import { buildIndexes } from '../../engine/indexes.js';
import { confusionMatrix, classMetrics, accuracy, macroF1, ratio, fmt, f1Of, durationAccuracy, namedRates, detected, computeAll, joinRows, RATE_TITLES } from '../../evaluation/metrics.js';
import { naiveEvaluate } from '../../evaluation/naiveBaseline.js';
import { naiveRows, runAblation, renderReport, ABLATION_GROUPS } from '../../evaluation/report.js';

const SEED = 20261022;
const each = generateDataset({ seed: SEED, mix: 'each' });
const engineOut = evaluateAll(each.tables);
const rows = joinRows(each.groundTruth, engineOut.runs, engineOut.findings);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);

test('a: metric formulas on hand-made confusion matrices', () => {
  // rows = expected, cols = actual (C, N, I)
  const pairs = [];
  const add = (e, a, n) => { for (let i = 0; i < n; i++) pairs.push({ expected: e, actual: a }); };
  add('COMPLIANT', 'COMPLIANT', 8); add('COMPLIANT', 'NON_COMPLIANT', 1); add('COMPLIANT', 'INDETERMINATE', 1);
  add('NON_COMPLIANT', 'NON_COMPLIANT', 6); add('NON_COMPLIANT', 'INDETERMINATE', 2);
  add('INDETERMINATE', 'COMPLIANT', 2); add('INDETERMINATE', 'NON_COMPLIANT', 3); add('INDETERMINATE', 'INDETERMINATE', 7);
  const m = confusionMatrix(pairs);
  close(accuracy(m), 21 / 30);
  const c = classMetrics(m);
  close(c.COMPLIANT.precision, 0.8); close(c.COMPLIANT.recall, 0.8); close(c.COMPLIANT.f1, 0.8);
  close(c.NON_COMPLIANT.precision, 0.6); close(c.NON_COMPLIANT.recall, 0.75); close(c.NON_COMPLIANT.f1, 2 / 3);
  close(c.INDETERMINATE.precision, 0.7); close(c.INDETERMINATE.recall, 7 / 12); close(c.INDETERMINATE.f1, 7 / 11);
  close(macroF1(c), (0.8 + 2 / 3 + 7 / 11) / 3);
  // zero division -> N/A (null), never NaN
  const empty = confusionMatrix([{ expected: 'COMPLIANT', actual: 'COMPLIANT' }, { expected: 'COMPLIANT', actual: 'NON_COMPLIANT' }]);
  const e = classMetrics(empty);
  assert.equal(e.INDETERMINATE.precision, null);
  assert.equal(e.INDETERMINATE.recall, null);
  assert.equal(e.INDETERMINATE.f1, null);
  assert.equal(e.NON_COMPLIANT.recall, null); // no expected NON_COMPLIANT
  assert.equal(e.NON_COMPLIANT.precision, 0); // predicted once, never right
  assert.equal(e.NON_COMPLIANT.f1, null); // recall undefined
  close(macroF1(e), 2 / 3); // only COMPLIANT has a defined F1 (precision 1, recall 0.5)
  assert.equal(ratio(0, 0), null);
  assert.equal(fmt(null), 'N/A');
  assert.equal(f1Of(0, 0), 0);
  assert.equal(f1Of(null, 1), null);
  assert.equal(accuracy(confusionMatrix([])), null);
  // named rates and durations on tiny hand-made rows
  const mk = (label, expected, actual, findings = [], extra = {}) => ({ shipment_id: label + actual + findings.length, label, variant: '', expected_decision: expected, expected_rule: extra.rule ?? 'ALL_RULES_PASS',
    expected_excursion_minutes: null, expected_gap_minutes: null, related_shipment_id: '', actual_status: actual, findings, actual_excursion_minutes: null, actual_gap_minutes: null, ...extra });
  const r = [mk('NONE', 'COMPLIANT', 'COMPLIANT'), mk('NONE', 'COMPLIANT', 'INDETERMINATE'), mk('TEMPERATURE_EXCURSION', 'NON_COMPLIANT', 'NON_COMPLIANT', [], { rule: 'R-TEMP-03' }), mk('TEMPERATURE_EXCURSION', 'NON_COMPLIANT', 'COMPLIANT', [], { rule: 'R-TEMP-03' })];
  const nr = namedRates(r);
  assert.deepEqual([nr.false_positive_rate.num, nr.false_positive_rate.den], [1, 2]);
  assert.deepEqual([nr.missed_excursion_rate.num, nr.missed_excursion_rate.den], [1, 2]);
  assert.equal(nr.silent_pass_detection_rate.rate, null); // no such shipments -> N/A
  assert.equal(detected(mk('MISSING_DATA', 'INDETERMINATE', 'INDETERMINATE', [{ rule_code: 'R-GAP-01', result: 'INDETERMINATE' }], { rule: 'R-GAP-01' })), true);
  assert.equal(detected(mk('MISSING_DATA', 'INDETERMINATE', 'INDETERMINATE', [{ rule_code: 'R-GAP-01', result: 'PASS' }], { rule: 'R-GAP-01' })), false);
  const d = durationAccuracy([{ ...r[0], expected_excursion_minutes: 30, actual_excursion_minutes: 30, expected_gap_minutes: 50, actual_gap_minutes: 60 },
    { ...r[0], expected_excursion_minutes: 40, actual_excursion_minutes: 20, expected_gap_minutes: null }]);
  assert.deepEqual([d.excursion_minutes.n, d.excursion_minutes.exact, d.excursion_minutes.mae], [2, 1, 10]);
  assert.deepEqual([d.gap_minutes.n, d.gap_minutes.exact, d.gap_minutes.mae], [1, 0, 10]);
});

const detectedByLabel = (out) => {
  const m = computeAll(joinRows(each.groundTruth, out.runs, out.findings));
  return Object.fromEntries(Object.entries(m.per_label).map(([k, v]) => [k, v.detected]));
};

test('b: ablation - disabling a rule collapses exactly its labels', () => {
  const base = detectedByLabel(engineOut);
  for (const [rule, labels] of [['R-GAP-01', ['MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED']], ['R-LOG-02', ['LOGGER_NOT_ASSIGNED']], ['R-CUS-01', ['CUSTODY_GAP']]]) {
    const off = detectedByLabel(evaluateAll(each.tables, { disabledRules: [rule] }));
    for (const [label, n] of Object.entries(base)) {
      if (labels.includes(label)) { assert.ok(n > 0); assert.equal(off[label], 0, `${rule} off -> ${label}`); }
      else assert.equal(off[label], n, `${rule} off must not change ${label}`);
    }
  }
  // the hook is opt-in: default evaluation is untouched
  assert.deepEqual(evaluateAll(each.tables, { disabledRules: [] }), engineOut);
  const off = evaluateAll(each.tables, { disabledRules: ['R-GAP-01'] });
  assert.ok(!off.findings.some((f) => f.rule_code === 'R-GAP-01'));
});

test('c: the naive baseline fails the five mandatory labels; the engine passes them', () => {
  const idx = buildIndexes(each.tables);
  const naive = naiveRows(rows, naiveEvaluate(each.tables, (l, a, b) => idx.windowReadings(l, a, b)));
  for (const label of ['LOGGER_NOT_ASSIGNED', 'POLICY_MISMATCH', 'MISSING_DATA_SILENTLY_PASSED', 'CUSTODY_GAP', 'CROSS_SHIPMENT_EXCURSION']) {
    const n = naive.filter((r) => r.label === label), e = rows.filter((r) => r.label === label);
    assert.ok(n.length > 0);
    assert.ok(n.every((r) => r.actual_status !== r.expected_decision), `naive must be wrong on ${label}`);
    assert.ok(e.every(detected), `engine must pass ${label}`);
  }
  // the naive checker is not useless: it handles the plain cases
  for (const label of ['NONE', 'TEMPERATURE_EXCURSION', 'EXCURSION_WITHIN_ALLOWANCE']) {
    assert.ok(naive.filter((r) => r.label === label).every((r) => r.actual_status === r.expected_decision), label);
  }
});

test('d: report contains every required named rate, the ablation table and the limitations', () => {
  const metrics = computeAll(rows);
  const idx = buildIndexes(each.tables);
  const naive = { rows: naiveRows(rows, naiveEvaluate(each.tables, (l, a, b) => idx.windowReadings(l, a, b))) };
  const ablation = runAblation({ ds: each.tables, groundTruth: each.groundTruth, baseline: metrics });
  const md = renderReport({ primary: { name: 'x', description: 'y', metrics, naive }, ablation, oracle: 'PASS' });
  for (const title of Object.values(RATE_TITLES)) assert.ok(md.includes(title), title);
  for (const g of ABLATION_GROUPS) assert.ok(md.includes(g), g);
  for (const s of ['Confusion matrix', 'Overall accuracy', 'Naive baseline', 'Ablation', 'Limitations', 'rule faithfulness', 'A-01..A-10']) assert.ok(md.includes(s), s);
  assert.ok(ablation.every((a) => a.hits_intended), JSON.stringify(ablation.filter((a) => !a.hits_intended)));
  assert.equal(metrics.accuracy, 1);
});
