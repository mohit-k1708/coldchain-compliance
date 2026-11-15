// Runs the generator twice in separate Node processes and compares row counts + sha256 of every file.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile } from '../generator/validateData.js';

const GEN = fileURLToPath(new URL('../generator/index.js', import.meta.url));

function runOnce({ seed, shipments, loggers, mix }) {
  const dir = mkdtempSync(join(tmpdir(), 'cc-repro-'));
  const args = [GEN, `--seed=${seed}`, `--shipments=${shipments}`, `--out=${dir}`, ...(loggers ? [`--loggers=${loggers}`] : []), ...(mix ? [`--mix=${mix}`] : [])];
  const t0 = performance.now();
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' }); // default Node flags
  const elapsed_ms = Math.round(performance.now() - t0);
  if (r.status !== 0) throw new Error(`generator failed: ${r.stderr || r.stdout}`);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const files = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) files[f] = hashFile(join(dir, f)); // re-hash from disk
  return { dir, manifest, files, elapsed_ms };
}

export function reproduce({ seed, shipments, loggers, mix, doc = null }) {
  const a = runOnce({ seed, shipments, loggers, mix }), b = runOnce({ seed, shipments, loggers, mix });
  const names = Object.keys(a.files);
  const rows = names.map((f) => ({
    file: f, rowsA: a.files[f].rows, rowsB: b.files[f]?.rows, shaA: a.files[f].sha256, shaB: b.files[f]?.sha256,
    match: a.files[f].rows === b.files[f]?.rows && a.files[f].sha256 === b.files[f]?.sha256
      && a.manifest.files[f].sha256 === a.files[f].sha256 && b.manifest.files[f].sha256 === b.files[f].sha256,
  }));
  const manifestsEqual = JSON.stringify(a.manifest) === JSON.stringify(b.manifest);
  const pass = rows.every((r) => r.match) && manifestsEqual && names.length === Object.keys(b.files).length;
  const result = { pass, rows, timings: { run1_ms: a.elapsed_ms, run2_ms: b.elapsed_ms }, inputs: { seed, shipments, loggers: loggers ?? 'default', mix: mix ?? 'default' }, manifestsEqual };
  rmSync(a.dir, { recursive: true, force: true }); rmSync(b.dir, { recursive: true, force: true });
  if (doc) writeFileSync(resolve(doc), renderDoc(result), 'utf8');
  return result;
}

function renderDoc(r) {
  const L = ['# Reproducibility', '', `**Result: ${r.pass ? 'PASS' : 'FAIL'}**`, '',
    'The generator was run twice in separate Node processes (default Node flags) into two temporary directories; row counts and sha256 of every file (including `ground_truth.csv`) were compared. Checksums were recomputed from the files on disk and also compared with each run\'s `manifest.json`.', '',
    '## Inputs', '', '```', `node generator/index.js --seed=${r.inputs.seed} --shipments=${r.inputs.shipments} --loggers=${r.inputs.loggers} --mix=${r.inputs.mix} --out=<tmp>`, '```', '',
    `Manifests identical: ${r.manifestsEqual}`, '', '## Timings', '', `- run 1: ${r.timings.run1_ms} ms`, `- run 2: ${r.timings.run2_ms} ms`, '',
    '## Checksums (run 1 / run 2)', '', '| file | rows 1 | rows 2 | sha256 run 1 | sha256 run 2 | match |', '|---|---:|---:|---|---|---|',
    ...r.rows.map((x) => `| ${x.file} | ${x.rowsA} | ${x.rowsB} | \`${x.shaA}\` | \`${x.shaB}\` | ${x.match ? 'yes' : 'NO'} |`), ''];
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const res = reproduce({ seed: Number(args.seed ?? 20261022), shipments: Number(args.shipments ?? 100), loggers: args.loggers ? Number(args.loggers) : undefined,
    mix: args.mix, doc: args.doc ?? 'docs/REPRODUCIBILITY.md' });
  console.log('file'.padEnd(30), 'rows'.padStart(9), 'match');
  for (const x of res.rows) console.log(x.file.padEnd(30), String(x.rowsA).padStart(9), x.match ? 'yes' : 'NO');
  console.log(`timings: ${res.timings.run1_ms} ms / ${res.timings.run2_ms} ms`);
  console.log(res.pass ? 'REPRODUCIBILITY PASS' : 'REPRODUCIBILITY FAIL');
  process.exit(res.pass ? 0 : 1);
}
void existsSync;
