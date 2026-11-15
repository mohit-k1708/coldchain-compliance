// npm run metrics -- --truth=data/generated/ground_truth.csv --results=data/results --out=docs/EVALUATION-REPORT.md
// (evaluation scripts may read ground truth; the engine never does)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { csvToRows, parseCsv } from '../generator/csv.js';
import { writeDatasetStream } from '../generator/index.js';
import { loadDataset } from '../engine/loadDataset.js';
import { ReadingStore } from '../engine/readingStore.js';
import { buildIndexes } from '../engine/indexes.js';
import { DEFAULT_AS_OF } from '../engine/index.js';
import { run as runEngine } from '../engine/cli.js';
import { computeAll, joinRows, pct, fmt } from './metrics.js';
import { naiveEvaluate } from './naiveBaseline.js';
import { naiveRows, runAblation, renderReport } from './report.js';

export function readTruth(file) {
  const [h, ...rows] = parseCsv(readFileSync(file, 'utf8')).filter((r) => r.length > 1);
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

export function analyzeDir({ dataDir, truthFile, resultsDir, ablation = false }) {
  const ds = loadDataset(dataDir, { skip: ['temperature_reading'] });
  const readingStore = ReadingStore.load(resolve(dataDir, 'temperature_reading.csv'));
  const groundTruth = readTruth(truthFile);
  const runs = csvToRows('compliance_run', readFileSync(resolve(resultsDir, 'compliance_run.csv'), 'utf8'));
  const findings = csvToRows('compliance_finding', readFileSync(resolve(resultsDir, 'compliance_finding.csv'), 'utf8'));
  const rows = joinRows(groundTruth, runs, findings);
  const metrics = computeAll(rows);
  const idx = buildIndexes(ds, { readingStore });
  const naive = { rows: naiveRows(rows, naiveEvaluate(ds, (l, a, b) => idx.windowReadings(l, a, b))) };
  const manifest = JSON.parse(readFileSync(resolve(dataDir, 'manifest.json'), 'utf8'));
  const out = { rows, metrics, naive, manifest };
  if (ablation) out.ablation = runAblation({ ds, readingStore, groundTruth, baseline: metrics, asOf: DEFAULT_AS_OF });
  return out;
}

const describe = (m) => `seed ${m.seed}, ${m.shipments} shipments, ${m.loggers} loggers, mix \`${typeof m.mix === 'string' ? m.mix : 'custom'}\`, generator ${m.generator_version}.`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));
  const truthFile = args.truth ?? 'data/generated/ground_truth.csv';
  const resultsDir = args.results ?? 'data/results';
  const dataDir = args.data ?? dirname(truthFile);
  const outFile = args.out ?? 'docs/EVALUATION-REPORT.md';
  const t0 = performance.now();

  const primary = analyzeDir({ dataDir, truthFile, resultsDir, ablation: args['skip-ablation'] !== 'true' });
  console.log(`primary: n=${primary.metrics.n} accuracy=${pct(primary.metrics.accuracy)} macroF1=${fmt(primary.metrics.macro_f1)}`);
  for (const [k, r] of Object.entries(primary.metrics.named_rates)) console.log(`  ${k.padEnd(34)} ${r.num}/${r.den} = ${pct(r.rate)}`);

  let holdout = null;
  if (args['skip-holdout'] !== 'true') {
    const hdir = args.holdout ?? 'data/holdout';
    if (!existsSync(resolve(hdir, 'manifest.json'))) {
      console.log('generating holdout (seed 777, 2000 shipments, 400 loggers, holdout mix) ...');
      await writeDatasetStream({ seed: 777, shipments: 2000, loggers: 400, mix: 'holdout' }, hdir);
    }
    runEngine({ inDir: hdir, outDir: resolve(hdir, 'results'), asOf: DEFAULT_AS_OF });
    const h = analyzeDir({ dataDir: hdir, truthFile: resolve(hdir, 'ground_truth.csv'), resultsDir: resolve(hdir, 'results') });
    const bad = h.rows.filter((r) => r.actual_status !== r.expected_decision);
    holdout = { name: 'seed 777 holdout (different seed and label mix)', description: describe(h.manifest), metrics: h.metrics, naive: h.naive,
      disagreements: bad.length ? `${bad.length} shipment(s) disagree: ${bad.slice(0, 10).map((r) => `${r.shipment_id} ${r.label}/${r.variant} expected ${r.expected_decision} got ${r.actual_status}`).join('; ')}` : 'None: the engine status equals the expected decision for every shipment.' };
    console.log(`holdout: n=${h.metrics.n} accuracy=${pct(h.metrics.accuracy)} macroF1=${fmt(h.metrics.macro_f1)}`);
  }

  let oracle = null;
  const prop = spawnSync(process.execPath, ['--test', 'tests/property/excursion.property.test.js'], { encoding: 'utf8' });
  const get = (k) => Number((prop.stdout.match(new RegExp(`ℹ ${k} (\\d+)`)) ?? [])[1] ?? NaN);
  oracle = `\`tests/property/excursion.property.test.js\`: 2,000 seeded random cases (2-60 readings, random omissions and long gaps, random limits, uncertainty 0-0.6) compared against an oracle that marks 1-minute cells instead of segmenting runs, plus a minute-by-minute brute-force gap scan. Result: ${prop.status === 0 ? 'PASS' : 'FAIL'} (${get('pass')} tests passed, ${get('fail')} failed).`;
  console.log(`oracle: ${prop.status === 0 ? 'PASS' : 'FAIL'}`);

  const rep = {
    primary: { name: `seed ${primary.manifest.seed}, ${primary.manifest.shipments} shipments`, description: describe(primary.manifest), metrics: primary.metrics, naive: primary.naive },
    ablation: primary.ablation, oracle, holdout,
  };
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  writeFileSync(resolve(outFile), renderReport(rep), 'utf8');
  const strip = (m) => m; // metrics are already plain data
  writeFileSync(resolve(outFile.replace(/\.md$/, '') + '.json'), JSON.stringify({ primary: { ...rep.primary, metrics: strip(rep.primary.metrics), naive: undefined }, ablation: rep.ablation, oracle: rep.oracle,
    holdout: holdout ? { ...holdout, naive: undefined } : null }, null, 2) + '\n', 'utf8');
  console.log(`wrote ${outFile} in ${Math.round(performance.now() - t0)} ms`);
}
