import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset } from '../../generator/index.js';
import { evaluateAll } from '../../engine/index.js';
import { build, every10, pick, AS_OF } from './fixture.js';

const SEED = 20261022;
const each = generateDataset({ seed: SEED, mix: 'each' });
const out = evaluateAll(each.tables);
const resultOf = (sid) => {
  const run = out.runs.find((r) => r.shipment_id === sid);
  return { run, findings: out.findings.filter((f) => f.compliance_run_id === run.compliance_run_id) };
};

test('untrusted logger evidence: no R-GAP-01 / R-TEMP findings, one R-TEMP-00 naming the cause', () => {
  const plan = ['NONE', ...Array(12).fill('LOGGER_NOT_ASSIGNED'), ...Array(3).fill('CALIBRATION_EXPIRED')];
  const ds = generateDataset({ seed: SEED, plan });
  const res = evaluateAll(ds.tables);
  const variants = new Set(ds.groundTruth.filter((g) => g.issue_type === 'LOGGER_NOT_ASSIGNED').map((g) => g.variant));
  assert.deepEqual([...variants].sort(), ['DELETED', 'WINDOW_TRUNCATED']); // both variants are covered
  for (const g of ds.groundTruth.filter((x) => x.issue_type !== 'NONE')) {
    const run = res.runs.find((r) => r.shipment_id === g.shipment_id);
    const fs = res.findings.filter((f) => f.compliance_run_id === run.compliance_run_id);
    const cause = g.issue_type === 'CALIBRATION_EXPIRED' ? 'R-LOG-03' : 'R-LOG-02';
    for (const code of ['R-GAP-01', 'R-TEMP-03', 'R-TEMP-04']) assert.ok(!fs.some((f) => f.rule_code === code), `${g.shipment_id} ${g.variant} must not emit ${code}`);
    const t0 = fs.filter((f) => f.rule_code === 'R-TEMP-00');
    assert.equal(t0.length, 1);
    assert.equal(t0[0].result, 'INDETERMINATE');
    assert.ok(t0[0].detail.startsWith('NOT_EVALUATED: readings untrusted because ' + cause), t0[0].detail);
    assert.equal(run.compliance_status, 'INDETERMINATE');
    assert.ok(run.reason_summary.startsWith(`INDETERMINATE [${cause}]:`), run.reason_summary);
  }
  // a normal shipment is still evaluated
  const none = res.runs.find((r) => r.shipment_id === ds.groundTruth.find((g) => g.issue_type === 'NONE').shipment_id);
  assert.ok(res.findings.some((f) => f.compliance_run_id === none.compliance_run_id && f.rule_code === 'R-TEMP-03'));
  assert.ok(!res.findings.some((f) => f.compliance_run_id === none.compliance_run_id && f.rule_code === 'R-TEMP-00'));
});

test('R-POL-01 does not gate: temperature is still evaluated against the correct policy', () => {
  const r = pick(evaluateAll(build({ shipments: [{ n: 1, dep: 0, arr: 50, readings: every10(0, 50, [5, 9, 9, 9, 9, 9]), policyId: 'POL-000002' }] }), { asOf: AS_OF }), 1);
  assert.equal(r.one('R-POL-01').result, 'INDETERMINATE');
  assert.ok(r.one('R-TEMP-03'), 'R-TEMP-03 present');
  assert.equal(r.by('R-TEMP-00').length, 0);
  assert.equal(r.status, 'NON_COMPLIANT'); // the confirmed excursion decides, against the correct policy
});

test('statuses agree with ground truth and reason_summary leads with the root-cause rule (--mix=each)', () => {
  assert.equal(out.runs.length, each.groundTruth.length);
  for (const g of each.groundTruth) {
    const { run, findings } = resultOf(g.shipment_id);
    assert.equal(run.compliance_status, g.expected_decision, `${g.issue_type} status`);
    // COMPLIANT shipments lead with ALL_RULES_PASS (a flagged legacy report is only a warning); others with the expected rule
    const rule = g.expected_decision === 'COMPLIANT' ? 'ALL_RULES_PASS' : g.expected_rule.split('+')[0];
    assert.ok(run.reason_summary.startsWith(`${g.expected_decision} [${rule}]: `), `${g.issue_type}: ${run.reason_summary}`);
    assert.equal(findings.some((f) => f.rule_code === 'R-TEMP-00'), ['LOGGER_NOT_ASSIGNED', 'CALIBRATION_EXPIRED'].includes(g.issue_type), g.issue_type);
  }
});

test('reason_summary format, root-cause priority and "+N other findings"', () => {
  const lone = pick(evaluateAll(build({ shipments: [{ n: 1, dep: 0, arr: 40, readings: every10(0, 40, [5, 5, 5, 5, 5]) }] }), { asOf: AS_OF }), 1);
  assert.match(lone.run.reason_summary, /^COMPLIANT \[ALL_RULES_PASS\]: .*\.$/);
  // INDETERMINATE priority: R-LOG-02 beats R-GAP-01-type findings; others are counted
  const both = pick(evaluateAll(build({ shipments: [{ n: 1, dep: 0, arr: 40, assign: false, readings: every10(0, 40, [5, 5, 5, 5, 5]), custody: [[1, 'PICKUP', 'PTY-000001', 'PTY-000002', 0]] }] }), { asOf: AS_OF }), 1);
  assert.match(both.run.reason_summary, /^INDETERMINATE \[R-LOG-02\]: .*\(\+\d+ other findings\)$/);
  assert.ok(both.by('R-CUS-01').length === 1 && both.one('R-CUS-01').result === 'INDETERMINATE');
});
