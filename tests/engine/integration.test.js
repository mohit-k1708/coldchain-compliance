import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDataset, writeDataset } from '../../generator/index.js';
import { evaluateAll } from '../../engine/index.js';
import { loadDataset, loadTable, TABLES } from '../../engine/loadDataset.js';

const SEED = 20261022;
const each = generateDataset({ seed: SEED, mix: 'each' });
const big = generateDataset({ seed: SEED, shipments: 200 });

function compare(ds) {
  const out = evaluateAll(ds.tables);
  const problems = [];
  for (const g of ds.groundTruth) {
    const run = out.runs.find((r) => r.shipment_id === g.shipment_id);
    const findings = out.findings.filter((f) => f.compliance_run_id === run.compliance_run_id);
    const tag = `${g.shipment_id} ${g.issue_type}/${g.variant}`;
    if (run.compliance_status !== g.expected_decision) problems.push(`${tag}: status ${run.compliance_status} != ${g.expected_decision} :: ${run.reason_summary}`);
    for (const rule of g.expected_rule.split('+')) {
      if (rule === 'ALL_RULES_PASS') continue;
      const f = findings.find((x) => x.rule_code === rule && (rule === 'R-ISO-01' || x.result !== 'PASS'));
      if (!f) problems.push(`${tag}: expected rule ${rule} missing`);
    }
    if (g.expected_excursion_minutes !== '') {
      const m = JSON.parse(findings.find((f) => f.rule_code === 'R-TEMP-03').detail_json).confirmed_out_minutes;
      if (m !== Number(g.expected_excursion_minutes)) problems.push(`${tag}: excursion ${m} != ${g.expected_excursion_minutes}`);
    }
    if (g.expected_gap_minutes !== '') {
      const gaps = JSON.parse(findings.find((f) => f.rule_code === 'R-GAP-01').detail_json).gaps;
      const max = Math.max(0, ...gaps.map((x) => x.minutes));
      if (max !== Number(g.expected_gap_minutes)) problems.push(`${tag}: gap ${max} != ${g.expected_gap_minutes}`);
    }
  }
  return { out, problems };
}

test('j: engine agrees with ground truth (--mix=each and 200 shipments)', () => {
  for (const ds of [each, big]) {
    const { out, problems } = compare(ds);
    assert.equal(out.runs.length, ds.groundTruth.length);
    assert.deepEqual(problems, []);
  }
});

test('k: idempotence, late-arriving data, coexisting runs', () => {
  const a = evaluateAll(each.tables), b = evaluateAll(each.tables);
  assert.deepEqual(a, b);
  assert.equal(evaluateAll(each.tables, { existing: a }).runs.length, 0); // same inputs -> no new run

  const none = each.groundTruth.find((g) => g.issue_type === 'NONE').shipment_id;
  const asg = each.tables.logger_assignment.find((x) => x.shipment_id === none);
  const rs = each.tables.temperature_reading.filter((r) => r.logger_assignment_id === asg.logger_assignment_id)
    .sort((x, y) => (x.recorded_at < y.recorded_at ? -1 : 1));
  const early = rs[20].received_at; // data after this point had not arrived yet
  const e = evaluateAll(each.tables, { asOf: early });
  const eRun = e.runs.find((r) => r.shipment_id === none);
  assert.equal(eRun.compliance_status, 'INDETERMINATE');
  assert.equal(e.findings.find((f) => f.compliance_run_id === eRun.compliance_run_id && f.rule_code === 'R-GAP-01').result, 'INDETERMINATE');
  const late = evaluateAll(each.tables, { existing: e });
  const lRun = late.runs.find((r) => r.shipment_id === none);
  assert.equal(lRun.compliance_status, 'COMPLIANT');
  assert.notEqual(lRun.input_fingerprint, eRun.input_fingerprint);
  assert.ok(late.supersededRunIds.includes(eRun.compliance_run_id));
  const ids = [...e.runs, ...late.runs].map((r) => r.compliance_run_id);
  assert.equal(new Set(ids).size, ids.length); // both runs coexist, nothing overwritten
});

test('l: the engine never touches ground truth', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(new URL('../../engine/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    if (f.endsWith('.js')) assert.ok(!readFileSync(f, 'utf8').includes('ground_truth'), f);
  }
  assert.throws(() => loadTable('.', 'ground_truth'), /whitelisted/);
  assert.throws(() => loadTable('.', 'manifest'), /whitelisted/);
  const dir = mkdtempSync(join(tmpdir(), 'cc-'));
  writeDataset(each, dir);
  writeFileSync(join(dir, 'ground_truth_extra.csv'), 'x\n');
  assert.deepEqual(Object.keys(loadDataset(dir)), [...TABLES]);
});

test('m: evidence integrity; NON_COMPLIANT runs have a FAIL finding', () => {
  const out = evaluateAll(big.tables);
  const readings = new Set(big.tables.temperature_reading.map((r) => r.reading_id));
  const findingIds = new Set(out.findings.map((f) => f.finding_id));
  assert.ok(out.evidence.length > 0);
  for (const e of out.evidence) { assert.ok(readings.has(e.reading_id), e.reading_id); assert.ok(findingIds.has(e.finding_id)); }
  const excIds = new Set(out.excursions.map((x) => x.excursion_id));
  for (const e of out.excursionEvidence) { assert.ok(readings.has(e.reading_id)); assert.ok(excIds.has(e.excursion_id)); }
  for (const r of out.runs.filter((x) => x.compliance_status === 'NON_COMPLIANT')) {
    assert.ok(out.findings.some((f) => f.compliance_run_id === r.compliance_run_id && f.result === 'FAIL'), r.shipment_id);
  }
  for (const x of out.excursions) assert.equal(x.source, 'ENGINE');
});
