// npm run docs:edgecases -> docs/EDGE-CASES.md, from the committed sample (data/sample) + a real engine run.
// This documentation script (not the engine) reads ground_truth.csv to pair labels with engine results.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../engine/loadDataset.js';
import { ReadingStore } from '../engine/readingStore.js';
import { evaluateAll } from '../engine/index.js';
import { readTruth } from '../evaluation/cli.js';

const root = fileURLToPath(new URL('..', import.meta.url));

// [label, mandatory #, what the injector builds (human readable), search keywords for the tests]
export const CASES = [
  ['LOGGER_NOT_ASSIGNED', 1, 'Readings exist for the physical logger but no logger_assignment row covers the shipment.', ['five mandatory', 'LOGGER_NOT_ASSIGNED']],
  ['POLICY_MISMATCH', 2, 'shipment.policy_id points to a policy of another product (or one not effective at departure).', ['five mandatory', 'POLICY_MISMATCH']],
  ['MISSING_DATA_SILENTLY_PASSED', 3, 'A data gap longer than the policy gap limit while the legacy system reported PASS.', ['five mandatory', 'MISSING_DATA_SILENTLY_PASSED']],
  ['CUSTODY_GAP', 4, 'A HANDOVER custody event is missing, so the chain from PICKUP to DELIVERY is not continuous.', ['five mandatory', 'CUSTODY_GAP']],
  ['CROSS_SHIPMENT_EXCURSION', 5, 'One physical logger serves two back-to-back shipments; an excursion spills across the boundary and the legacy report is filed against the wrong shipment.', ['five mandatory', 'f: ISOLATION', 'CROSS_SHIPMENT_EXCURSION']],
  ['TEMPERATURE_EXCURSION', 0, 'Confirmed out-of-range runs whose total exceeds the policy allowance.', ['b: statement example', 'c: single OUT', 'temperature excursion arithmetic']],
  ['EXCURSION_WITHIN_ALLOWANCE', 0, 'Out-of-range time that stays within the allowed excursion minutes.', ['b: statement example', 'EXCURSION_WITHIN_ALLOWANCE']],
  ['BOUNDARY_AT_LIMIT', 0, 'Readings exactly at the edge of the IN band (limit minus or plus calibration uncertainty).', ['a: reading classification', 'BOUNDARY_AT_LIMIT']],
  ['CALIBRATION_MARGINAL', 0, 'Readings within the calibration uncertainty of a limit; counting them as OUT would exceed the allowance.', ['g: marginal readings', 'CALIBRATION_MARGINAL']],
  ['CALIBRATION_EXPIRED', 0, 'Logger calibration had expired when the readings were recorded.', ['i: expired calibration', 'CALIBRATION_EXPIRED']],
  ['MISSING_DATA', 0, 'A data gap longer than the policy gap limit and no legacy PASS.', ['e: missing data example', 'd: a run is not extended', 'gap report states']],
  ['ROUTE_DEVIATION', 0, 'A planned stop is missing, an unexpected stop occurs, stops are out of order, or dwell exceeds the limit.', ['ROUTE_DEVIATION']],
  ['NONE', 0, 'Control shipment: no anomaly injected.', ['a: --mix=each gives one row']],
];

function listTests() {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = resolve(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.test.js')) out.push(p); } };
  walk(resolve(root, 'tests'));
  return out.sort();
}

// For each keyword, find test files mentioning it and the nearest preceding test('...') title.
export function findTests(keywords, files = listTests()) {
  const hits = [];
  for (const kw of keywords) {
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes(kw)) return;
        for (let j = i; j >= 0; j--) {
          const m = lines[j].match(/^\s*test\((['"`])(.+?)\1/);
          if (m) { const key = `${relative(root, f).replace(/\\/g, '/')}::${m[2]}`; if (!hits.includes(key)) hits.push(key); break; }
        }
      });
    }
  }
  return hits;
}

export function build({ dir = resolve(root, 'data/sample') } = {}) {
  const tables = loadDataset(dir, { skip: ['temperature_reading'] });
  const readingStore = ReadingStore.load(resolve(dir, 'temperature_reading.csv'));
  const out = evaluateAll(tables, { readingStore });
  const truth = readTruth(resolve(dir, 'ground_truth.csv'));
  const runBy = new Map(out.runs.map((r) => [r.shipment_id, r]));
  const ship = new Map(tables.shipment.map((s) => [s.shipment_id, s]));
  const examples = readdirSync(resolve(root, 'docs/examples')).filter((f) => f.endsWith('.md') && f !== 'INDEX.md');
  const files = listTests();
  const rows = [];
  for (const [label, mandatory, built, kws] of CASES) {
    const exm = examples.find((f) => f.startsWith(`${label}-`));
    const sid = exm ? exm.slice(label.length + 1, -3) : truth.find((g) => g.issue_type === label)?.shipment_id;
    const g = truth.find((x) => x.shipment_id === sid);
    if (!g) continue;
    const run = runBy.get(sid);
    const s = ship.get(sid);
    const facts = [
      `variant ${g.variant || '-'}`,
      `${tables.logger_assignment.filter((a) => a.shipment_id === sid).length} logger assignment(s)`,
      `applied policy ${s.policy_id}`,
      `${tables.custody_event.filter((c) => c.shipment_id === sid).length} custody events`,
      `legacy report: ${(tables.legacy_report.find((l) => l.shipment_id === sid) ?? {}).reported_status ?? 'none'}`,
      g.expected_excursion_minutes ? `expected excursion ${g.expected_excursion_minutes} min` : null,
      g.expected_gap_minutes ? `expected gap ${g.expected_gap_minutes} min` : null,
      g.related_shipment_id ? `related shipment ${g.related_shipment_id}` : null,
    ].filter(Boolean).join('; ');
    const rule = (run.reason_summary.match(/\[([^\]]+)\]/) ?? [])[1] ?? 'ALL_RULES_PASS';
    rows.push({ label, mandatory, built, sid, facts, expected: `${g.expected_decision} (${g.expected_rule})`, actual: run.compliance_status, rule, reason: run.reason_summary,
      agrees: run.compliance_status === g.expected_decision, tests: findTests(kws, files).slice(0, 3), example: exm ? `docs/examples/${exm}` : null });
  }
  return rows;
}

export function render(rows) {
  const L = ['# Edge cases', '', 'Generated by `npm run docs:edgecases` from the committed sample (`data/sample`, seed 20261022, 100 shipments) and a real engine run. Do not edit by hand.', '',
    'The first five cases are the **mandatory** ones; the rest are extra covered cases. "Expected" comes from `ground_truth.csv` (written by the injector from what it injected, never read by the engine); "actual" is the engine output.', '',
    '| # | case | shipment | expected | actual | agrees |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.mandatory || 'extra'} | ${r.label} | ${r.sid} | ${r.expected} | ${r.actual} [${r.rule}] | ${r.agrees ? 'yes' : '**NO**'} |`), ''];
  for (const r of rows) {
    L.push(`## ${r.mandatory ? `Mandatory case ${r.mandatory}: ` : ''}${r.label}`, '',
      `- **Shipment:** ${r.sid}`, `- **Synthetic input:** ${r.built}`, `- **Input facts:** ${r.facts}`,
      `- **Expected ground truth:** ${r.expected}`, `- **Actual engine result:** ${r.actual}, rule ${r.rule}`, `- **reason_summary:** ${r.reason}`,
      `- **Automated tests:** ${r.tests.length ? r.tests.map((t) => `\`${t.replace('::', '` > "')}"`).join('; ') : '(none found)'}`,
      `- **Evidence:** ${r.example ? `[${r.example}](examples/${r.example.split('/').pop()})` : '(no example report)'}`, '');
  }
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = build();
  writeFileSync(resolve(root, 'docs/EDGE-CASES.md'), render(rows), 'utf8');
  console.log(`wrote docs/EDGE-CASES.md (${rows.length} cases, ${rows.filter((r) => !r.agrees).length} disagreements)`);
  if (rows.some((r) => !r.agrees)) process.exit(1);
}
void existsSync;
