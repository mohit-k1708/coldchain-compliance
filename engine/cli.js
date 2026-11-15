import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from './loadDataset.js';
import { evaluateAll, DEFAULT_AS_OF } from './index.js';
import { tableToCsv } from '../generator/csv.js';

export function run({ inDir, outDir, asOf }) {
  const t0 = performance.now();
  const ds = loadDataset(inDir);
  const tLoad = performance.now();
  const res = evaluateAll(ds, { asOf });
  const t1 = performance.now();
  mkdirSync(outDir, { recursive: true });
  const files = { compliance_run: res.runs, compliance_finding: res.findings, compliance_evidence: res.evidence,
    excursion_report: res.excursions, excursion_evidence: res.excursionEvidence };
  for (const [t, rows] of Object.entries(files)) writeFileSync(resolve(outDir, `${t}.csv`), tableToCsv(t, rows), 'utf8');
  const byStatus = {}, byRule = {};
  for (const r of res.runs) byStatus[r.compliance_status] = (byStatus[r.compliance_status] ?? 0) + 1;
  for (const f of res.findings) {
    byRule[f.rule_code] ??= {};
    byRule[f.rule_code][f.result] = (byRule[f.rule_code][f.result] ?? 0) + 1;
  }
  const evalMs = Math.round(t1 - tLoad);
  const summary = {
    as_of: asOf, shipments_evaluated: res.runs.length, findings: res.findings.length, engine_excursions: res.excursions.length,
    by_status: byStatus, by_rule_code: byRule, load_ms: Math.round(tLoad - t0), evaluate_ms: evalMs,
    runtime_ms: Math.round(performance.now() - t0), shipments_per_second: Math.round((res.runs.length / Math.max(evalMs, 1)) * 1000),
    peak_memory_mb: Math.round(process.resourceUsage().maxRSS / 1024),
  };
  writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const summary = run({ inDir: args.in ?? 'data/generated', outDir: args.out ?? 'data/results', asOf: args['as-of'] ?? DEFAULT_AS_OF });
  console.log(JSON.stringify(summary, null, 2));
}
