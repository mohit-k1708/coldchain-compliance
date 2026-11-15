// Runs generate -> validate -> evaluate as separate Node processes (default flags) and records time + peak RSS.
import { spawnSync } from 'node:child_process';
import { statSync, readdirSync, readFileSync } from 'node:fs';
import { recordPerf } from './perfDoc.js';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const seed = args.seed ?? 20261022, shipments = args.shipments ?? 5000, loggers = args.loggers ?? 1000;
const dir = args.dir ?? 'data/generated', results = args.results ?? 'data/results';

function step(name, script, scriptArgs) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [resolve(root, script), ...scriptArgs], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const wall = Math.round(performance.now() - t0);
  const line = (r.stdout.split('\n').filter((l) => l.startsWith('{"step"')).pop()) ?? '{}';
  const m = JSON.parse(line);
  console.log(`${name}: exit ${r.status}, ${wall} ms wall, peak RSS ${m.peak_rss_mb} MB`);
  if (r.status !== 0) console.log(r.stdout.slice(-2000), r.stderr.slice(-2000));
  return { name, exit: r.status, wall_ms: wall, peak_rss_mb: m.peak_rss_mb, out: r.stdout };
}

const gen = step('generate', 'generator/index.js', [`--seed=${seed}`, `--shipments=${shipments}`, `--loggers=${loggers}`, `--out=${dir}`]);
const val = step('validate', 'generator/validateData.js', [`--in=${dir}`, '--out=docs/VALIDATION-SUMMARY.md']);
const ev = step('evaluate', 'engine/cli.js', [`--in=${dir}`, `--out=${results}`]);
const summary = JSON.parse(readFileSync(resolve(root, results, 'summary.json'), 'utf8'));
const size = (d) => Object.fromEntries(readdirSync(resolve(root, d)).map((f) => [f, statSync(join(resolve(root, d), f)).size]));
recordPerf('perf', {
  measured_at: new Date().toISOString().slice(0, 10), seed, shipments: Number(shipments), loggers: Number(loggers), node: process.version, platform: process.platform,
  steps: [
    { name: 'generate (streaming)', wall_ms: gen.wall_ms, peak_rss_mb: gen.peak_rss_mb, notes: `exit ${gen.exit}` },
    { name: 'validate (streaming readings)', wall_ms: val.wall_ms, peak_rss_mb: val.peak_rss_mb, notes: `exit ${val.exit}` },
    { name: 'evaluate (ReadingStore)', wall_ms: ev.wall_ms, peak_rss_mb: ev.peak_rss_mb, notes: `${summary.shipments_per_second} shipments/s (evaluation only), load ${summary.load_ms} ms, evaluate ${summary.evaluate_ms} ms` },
  ],
  evaluation_note: `Evaluation produced ${summary.shipments_evaluated} runs, ${summary.findings} findings, ${summary.engine_excursions} engine excursions.`,
  file_sizes: { [dir]: size(dir), [results]: size(results) },
});
process.exit(gen.exit || val.exit || ev.exit);
