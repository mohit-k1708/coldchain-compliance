import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDataset } from '../../generator/index.js';
import { evaluateAll } from '../../engine/index.js';
import { buildReport, renderMarkdown, renderHtml } from '../../engine/report.js';

const SEED = 20261022;
const ds = generateDataset({ seed: SEED, mix: 'each' });
const T = ds.tables;
const readingIds = new Set(T.temperature_reading.map((r) => r.reading_id));
const out = evaluateAll(T);
const one = (label, variant) => ds.groundTruth.find((g) => g.issue_type === label && (!variant || g.variant === variant));

test('every label: report has policy id, limits, decision, rule code; every cited reading exists', () => {
  for (const g of ds.groundTruth) {
    const rep = buildReport(T, g.shipment_id);
    const md = renderMarkdown(rep);
    const p = rep.policy.used;
    assert.ok(md.includes(p.policy_id), `${g.issue_type} policy id`);
    assert.ok(md.includes(`${p.min.toFixed(2)} to ${p.max.toFixed(2)} C`), `${g.issue_type} limits`);
    assert.ok(md.includes(`Status: ${g.expected_decision}`), `${g.issue_type} decision`);
    assert.ok(md.includes(g.expected_rule.split('+')[0]), `${g.issue_type} rule ${g.expected_rule}`);
    assert.equal(rep.header.status, g.expected_decision);
    // the report agrees with a full evaluation run (same run id and fingerprint)
    const run = out.runs.find((r) => r.shipment_id === g.shipment_id);
    assert.equal(rep.header.run_id, run.compliance_run_id);
    assert.equal(rep.header.fingerprint, run.input_fingerprint);
    assert.equal(rep.header.reason_summary, run.reason_summary);
    for (const id of md.match(/TEMP-LGR-\d{6}-\d{8}T\d{6}Z/g) ?? []) assert.ok(readingIds.has(id), `${g.issue_type}: cited reading ${id} not in readings`);
    assert.equal(rep.trace.length, out.findings.filter((f) => f.compliance_run_id === run.compliance_run_id).length);
  }
});

test('temperature excursion arithmetic equals the engine', () => {
  const g = one('TEMPERATURE_EXCURSION');
  const rep = buildReport(T, g.shipment_id);
  const run = out.runs.find((r) => r.shipment_id === g.shipment_id);
  const f = out.findings.find((x) => x.compliance_run_id === run.compliance_run_id && x.rule_code === 'R-TEMP-03');
  const j = JSON.parse(f.detail_json);
  const md = renderMarkdown(rep);
  const m = md.match(/Confirmed out-of-range: ([\d + ]+) = (\d+) min (>|<=) (\d+) min allowed/);
  assert.ok(m, 'arithmetic line present');
  assert.deepEqual(m[1].split('+').map((x) => Number(x.trim())), j.runs.map((r) => r.duration_minutes));
  assert.equal(Number(m[2]), j.confirmed_out_minutes);
  assert.equal(Number(m[2]), Number(g.expected_excursion_minutes));
  assert.equal(Number(m[4]), j.allowed_minutes);
  assert.equal(m[3], '>');
  assert.ok(md.includes('sample-and-hold'));
});

test('gap report states the missing sample count and never implies in-range during a gap', () => {
  const g = one('MISSING_DATA');
  const rep = buildReport(T, g.shipment_id);
  const md = renderMarkdown(rep);
  const run = out.runs.find((r) => r.shipment_id === g.shipment_id);
  const j = JSON.parse(out.findings.find((x) => x.compliance_run_id === run.compliance_run_id && x.rule_code === 'R-GAP-01').detail_json);
  assert.equal(j.missing_sample_count, Number(g.expected_gap_minutes) / 10 - 1);
  assert.ok(md.includes(`Total missing samples: ${j.missing_sample_count}`));
  assert.equal(rep.gaps.rows.length, 1);
  assert.ok(md.includes('never counted as in range'));
  assert.ok(!/stayed in range/i.test(md));
});

test('untrusted-logger report says temperature was not evaluated and why', () => {
  const g = one('LOGGER_NOT_ASSIGNED');
  const md = renderMarkdown(buildReport(T, g.shipment_id));
  assert.ok(md.includes('Temperature was not evaluated'));
  assert.ok(md.includes('NOT_EVALUATED: readings untrusted because R-LOG-02'));
  assert.ok(md.includes('Not evaluated (readings untrusted).'));
});

test('deterministic output; evidence appendix cap note', () => {
  const g = one('TEMPERATURE_EXCURSION');
  assert.equal(renderMarkdown(buildReport(T, g.shipment_id)), renderMarkdown(buildReport(T, g.shipment_id)));
  assert.equal(renderHtml(buildReport(T, g.shipment_id)), renderHtml(buildReport(T, g.shipment_id)));
  const rep = buildReport(T, g.shipment_id);
  assert.ok(rep.evidence.total > 0 && !rep.evidence.capped);
  // force a capped appendix: a long excursion cites many readings
  const many = structuredClone(T);
  const counts = new Map();
  for (const rd of many.temperature_reading) counts.set(rd.logger_assignment_id, (counts.get(rd.logger_assignment_id) ?? 0) + 1);
  const longAsg = many.logger_assignment.find((a) => counts.get(a.logger_assignment_id) > 220 && ds.groundTruth.find((q) => q.shipment_id === a.shipment_id).issue_type === 'NONE');
  assert.ok(longAsg, 'a long NONE shipment exists in the each-mix');
  const sid = longAsg.shipment_id;
  const asg = longAsg;
  for (const r of many.temperature_reading) if (r.logger_assignment_id === asg.logger_assignment_id) r.temperature_c = 20; // everything OUT
  const big = buildReport(many, sid);
  assert.ok(big.evidence.capped && big.evidence.total > 200 && big.evidence.rows.length === 200);
  assert.match(renderMarkdown(big), /Showing 200 of \d+ cited readings\. Full list: temperature_reading\.csv: logger_id = LGR-\d+ AND recorded_at BETWEEN/);
});

test('HTML escapes injected markup', () => {
  const g = one('NONE');
  const evil = '<script>alert(1)</script>';
  const t2 = { ...T, shipment: T.shipment.map((s) => (s.shipment_id === g.shipment_id ? { ...s, origin_location: evil } : s)),
    route_stop: T.route_stop.map((r) => (r.shipment_id === g.shipment_id ? { ...r, location: evil } : r)),
    party: T.party.map((p) => (p.party_id === T.shipment.find((s) => s.shipment_id === g.shipment_id).destination_party_id ? { ...p, party_name: evil } : p)) };
  const html = renderHtml(buildReport(t2, g.shipment_id));
  assert.ok(!html.includes('<script>'), 'no raw script tag');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<style>') && !html.includes('<link') && !html.includes('src='));
  assert.ok(renderMarkdown(buildReport(t2, g.shipment_id)).includes(evil)); // markdown is plain text, not HTML
});

test('only delivered shipments can be reported', () => {
  assert.throws(() => buildReport(T, 'SHP-2026-999999'), /not found/);
});
