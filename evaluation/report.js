import { CLASSES, RATE_TITLES, DRIVER_RULES, computeAll, confusionMatrix, accuracy, classMetrics, macroF1, joinRows, pct, fmt } from './metrics.js';
import { evaluateAll } from '../engine/index.js';

export const ABLATION_GROUPS = ['R-TEMP-03', 'R-TEMP-04', 'R-GAP-01', 'R-LOG-02', 'R-LOG-03', 'R-POL-01', 'R-CUS-01', 'R-ROUTE', 'R-SILENT-01', 'R-ISO-01'];
export const INTENDED = {
  'R-TEMP-03': ['TEMPERATURE_EXCURSION'], 'R-TEMP-04': ['CALIBRATION_MARGINAL'], 'R-GAP-01': ['MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED'],
  'R-LOG-02': ['LOGGER_NOT_ASSIGNED'], 'R-LOG-03': ['CALIBRATION_EXPIRED'], 'R-POL-01': ['POLICY_MISMATCH'], 'R-CUS-01': ['CUSTODY_GAP'],
  'R-ROUTE': ['ROUTE_DEVIATION'], 'R-SILENT-01': ['MISSING_DATA_SILENTLY_PASSED'], 'R-ISO-01': ['CROSS_SHIPMENT_EXCURSION'],
};

// Rows for the naive baseline: status only (it has no rules/findings).
export function naiveRows(rows, statusMap) {
  return rows.map((r) => ({ ...r, actual_status: statusMap.get(r.shipment_id) ?? 'MISSING', findings: [], actual_excursion_minutes: null, actual_gap_minutes: null }));
}

// Re-evaluates with one rule group disabled and compares with the baseline metrics.
export function runAblation({ ds, readingStore, groundTruth, baseline, groups = ABLATION_GROUPS, asOf }) {
  return groups.map((g) => {
    const out = evaluateAll(ds, { readingStore, asOf, disabledRules: [g] });
    const m = computeAll(joinRows(groundTruth, out.runs, out.findings));
    const changes = [];
    for (const [label, o] of Object.entries(m.per_label)) {
      const b = baseline.per_label[label];
      if (b && o.detected !== b.detected) changes.push({ label, from: b.detection_rate, to: o.detection_rate });
    }
    const intended = INTENDED[g] ?? [];
    const hit = intended.length > 0 && intended.every((l) => changes.some((c) => c.label === l && c.to < c.from));
    return { rule: g, accuracy: m.accuracy, accuracy_delta: m.accuracy - baseline.accuracy, macro_f1: m.macro_f1, changes, intended, hits_intended: hit,
      changes_nothing: changes.length === 0 && m.accuracy === baseline.accuracy };
  });
}

// ---- markdown --------------------------------------------------------------------------------------------
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) => [row(head), row(head.map((_, i) => (i === 0 ? '---' : '---:'))), ...rows.map(row)];

export function renderConfusion(cm) {
  return table(['expected \\ actual', ...CLASSES], CLASSES.map((e) => [e, ...CLASSES.map((a) => cm[e][a])]));
}

export function renderMetrics(m, { heading = '###' } = {}) {
  const L = [];
  L.push(`${heading} Confusion matrix (rows = expected, columns = actual), n = ${m.n}`, '', ...renderConfusion(m.confusion), '');
  L.push(`Overall accuracy: **${pct(m.accuracy)}**  |  macro-F1: **${fmt(m.macro_f1)}**`, '');
  L.push(...table(['class', 'support', 'precision', 'recall', 'F1'], CLASSES.map((c) => [c, m.classes[c].support, fmt(m.classes[c].precision), fmt(m.classes[c].recall), fmt(m.classes[c].f1)])), '');
  L.push(`${heading} Per issue type`, '', 'Detection = engine status equals expected AND the expected rule code is among the findings.', '',
    ...table(['label', 'count', 'detection rate', 'status accuracy', ...CLASSES.map((c) => `-> ${c}`)],
      Object.entries(m.per_label).sort().map(([k, o]) => [k, o.count, pct(o.detection_rate), pct(o.status_accuracy), ...CLASSES.map((c) => o.row[c])])), '');
  L.push(`${heading} Rule-level precision / recall`, '', 'A rule "fires" when it produces a FAIL or INDETERMINATE finding; "expected" = the shipment label names that rule.', '',
    ...table(['rule', 'fired', 'expected', 'true positives', 'precision', 'recall', 'F1'],
      DRIVER_RULES.map((r) => [r, m.rules[r].fired, m.rules[r].expected, m.rules[r].tp, fmt(m.rules[r].precision), fmt(m.rules[r].recall), fmt(m.rules[r].f1)])), '');
  L.push(`${heading} Named rates`, '', ...table(['rate', 'numerator', 'denominator', 'value'],
    Object.entries(RATE_TITLES).map(([k, t]) => [t, m.named_rates[k].num, m.named_rates[k].den, pct(m.named_rates[k].rate)])), '');
  const d = m.duration;
  L.push(`${heading} Duration accuracy`, '', ...table(['quantity', 'n', 'exact match', 'exact-match rate', 'mean absolute error (min)'],
    [['excursion minutes', d.excursion_minutes.n, d.excursion_minutes.exact, pct(d.excursion_minutes.exact_rate), fmt(d.excursion_minutes.mae, 2)],
      ['gap minutes', d.gap_minutes.n, d.gap_minutes.exact, pct(d.gap_minutes.exact_rate), fmt(d.gap_minutes.mae, 2)]]), '');
  return L;
}

export function naiveSection(engine, naive) {
  const cm = confusionMatrix(naive.rows.map((r) => ({ expected: r.expected_decision, actual: r.actual_status })));
  const cls = classMetrics(cm);
  const L = ['### Naive baseline confusion matrix', '', ...renderConfusion(cm), '',
    `Naive accuracy: **${pct(accuracy(cm))}** vs engine **${pct(engine.accuracy)}**; naive macro-F1 ${fmt(macroF1(cls))} vs engine ${fmt(engine.macro_f1)}.`, ''];
  const nl = {};
  for (const r of naive.rows) { const o = (nl[r.label] ??= { n: 0, ok: 0 }); o.n++; if (r.actual_status === r.expected_decision) o.ok++; }
  L.push('### Per issue type: engine detection vs naive correct-status rate', '',
    ...table(['label', 'count', 'engine detection', 'naive correct status', 'naive fails?'],
      Object.entries(engine.per_label).sort().map(([k, o]) => [k, o.count, pct(o.detection_rate), pct(nl[k].ok / nl[k].n), nl[k].ok < nl[k].n ? 'YES' : 'no'])), '');
  return L;
}

export function ablationSection(ab) {
  return ['## Ablation: disable one rule group and re-evaluate', '',
    'Each row removes that rule group\'s findings before precedence (`evaluateAll(..., { disabledRules })`). "Collapsed labels" are labels whose detection rate dropped.', '',
    ...table(['rule group disabled', 'accuracy', 'accuracy change', 'collapsed labels (detection before -> after)', 'hits intended label', 'changes nothing'],
      ab.map((a) => [a.rule, pct(a.accuracy), `${a.accuracy_delta >= 0 ? '+' : ''}${(a.accuracy_delta * 100).toFixed(2)} pp`,
        a.changes.map((c) => `${c.label} ${pct(c.from)} -> ${pct(c.to)}`).join('; ') || '(none)', a.hits_intended ? 'yes' : 'NO', a.changes_nothing ? 'FLAG' : 'no'])),
    '', ab.filter((a) => a.changes_nothing || !a.hits_intended).length
      ? `Weak rules: ${ab.filter((a) => a.changes_nothing || !a.hits_intended).map((a) => a.rule).join(', ')}.` : 'Every rule group hits its intended label and none is redundant.', ''];
}

export function renderReport(rep) {
  const L = ['# Evaluation report', '',
    '## Method', '',
    '1. The generator produces shipments and records, for every shipment, the label of the injector that mutated it (`ground_truth.csv`). Labels come from what the injector actually did, never from engine code.',
    '2. The compliance engine (`engine/`) evaluates the dataset without reading ground truth.',
    '3. `evaluation/metrics.js` joins the two and computes the confusion matrix, per-class precision/recall/F1, per-label detection, rule-level precision, named rates and duration accuracy (zero denominators are reported as N/A).',
    '4. A naive baseline (`evaluation/naiveBaseline.js`) implements the five mandatory failure modes; an ablation disables one rule group at a time (`disabledRules` evaluation hook in the engine); an independent oracle property test checks excursion arithmetic; a holdout dataset with a different seed and mix checks generalisation of the rules.', ''];
  if (rep.primary) {
    L.push(`## Results: ${rep.primary.name}`, '', rep.primary.description, '', ...renderMetrics(rep.primary.metrics));
    if (rep.primary.naive) L.push('## Naive baseline comparison', '', ...naiveSection(rep.primary.metrics, rep.primary.naive));
    if (rep.ablation) L.push(...ablationSection(rep.ablation));
  }
  if (rep.oracle) L.push('## Independent oracle property test', '', rep.oracle, '');
  if (rep.holdout) {
    L.push(`## Holdout: ${rep.holdout.name}`, '', rep.holdout.description, '', ...renderMetrics(rep.holdout.metrics));
    if (rep.holdout.naive) L.push('### Holdout naive baseline', '', ...naiveSection(rep.holdout.metrics, rep.holdout.naive));
    if (rep.holdout.disagreements) L.push('### Disagreements', '', rep.holdout.disagreements, '');
  }
  L.push('## Limitations', '',
    '- The ground-truth labels are produced by injectors written from the same documented rules (`docs/BUSINESS-RULES.md`) that the engine implements. High scores therefore demonstrate **rule faithfulness** (the engine does what the documented rules say), not accuracy on real cold-chain data.',
    '- The injectors create one anomaly per shipment, so interactions between anomalies (for example a temperature excursion on a shipment that also has a custody gap) are not exercised.',
    '- Assumptions A-01..A-10 in the business rules are our own interpretations of an ambiguous statement; they are **not** Yotta\'s official definitions and a different reading would change both the labels and the expected decisions.',
    '- Logger streams, delays, dwell times and temperature noise are synthetic (AR(1) around the range midpoint); real sensors have drift, spikes and clock errors that are not modelled.',
    '- The naive baseline is a straw man built to show the mandatory failure modes; it is not a model of any real vendor system.', '');
  return L.join('\n');
}
