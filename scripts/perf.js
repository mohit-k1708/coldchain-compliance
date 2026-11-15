// Runs generate -> validate -> evaluate as separate Node processes (default flags) and records time + peak RSS.
import { spawnSync } from 'node:child_process';
import { writeFileSync, statSync, readdirSync, readFileSync } from 'node:fs';
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
const size = (d) => readdirSync(resolve(root, d)).map((f) => [f, statSync(join(resolve(root, d), f)).size]);
const mb = (b) => (b / 1048576).toFixed(2);
const L = ['# Performance', '', `Dataset: seed ${seed}, ${shipments} shipments, ${loggers} loggers. Node ${process.version}, default flags (no \`--max-old-space-size\`), ${process.platform}.`, '',
  '| step | wall time | peak RSS | notes |', '|---|---:|---:|---|',
  `| generate (streaming) | ${(gen.wall_ms / 1000).toFixed(1)} s | ${gen.peak_rss_mb} MB | exit ${gen.exit} |`,
  `| validate (streaming readings) | ${(val.wall_ms / 1000).toFixed(1)} s | ${val.peak_rss_mb} MB | exit ${val.exit} |`,
  `| evaluate (ReadingStore) | ${(ev.wall_ms / 1000).toFixed(1)} s | ${ev.peak_rss_mb} MB | ${summary.shipments_per_second} shipments/s (evaluation only), load ${summary.load_ms} ms, evaluate ${summary.evaluate_ms} ms |`, '',
  `Evaluation produced ${summary.shipments_evaluated} runs, ${summary.findings} findings, ${summary.engine_excursions} engine excursions.`, '',
  `## File sizes (${dir})`, '', '| file | MB |', '|---|---:|', ...size(dir).map(([f, b]) => `| ${f} | ${mb(b)} |`), '',
  `## File sizes (${results})`, '', '| file | MB |', '|---|---:|', ...size(results).map(([f, b]) => `| ${f} | ${mb(b)} |`), ''];
writeFileSync(resolve(root, 'docs/PERFORMANCE.md'), L.join('\n'), 'utf8');
process.exit(gen.exit || val.exit || ev.exit);
