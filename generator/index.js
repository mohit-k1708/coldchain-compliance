import { mkdirSync, writeFileSync, readFileSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { deriveRng } from './prng.js';
import { parseSchema } from './schema.js';
import { csvHeader, csvLine } from './csv.js';
import { generateMasterData } from './masterData.js';
import { buildBaseline, DEP_START, SPAN_UNITS } from './shipmentGenerator.js';
import { applyInjector, applyCrossPair } from './injectors.js';
import { resolvePlan } from './plan.js';
import { GRID, MIN, HOUR, parse } from './time.js';

export const GT_COLUMNS = ['shipment_id', 'issue_type', 'variant', 'expected_decision', 'expected_evidence_category',
  'expected_rule', 'expected_excursion_minutes', 'expected_gap_minutes', 'related_shipment_id'];
const CROSS = 'CROSS_SHIPMENT_EXCURSION';
const MAR1_UNITS = (parse('2026-03-01T00:00:00Z') - DEP_START) / GRID;
const GUARD_UNITS = 8 * 144; // 8 days kept free at the end of every slot (room for a cross pair)

export const generatorVersion = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const gtLine = (g) => GT_COLUMNS.map((c) => g[c] ?? '').join(',') + '\n';
const GT_HEADER = GT_COLUMNS.join(',') + '\n';

// Shipment-by-shipment generator. Only master data and a few pending pair partners live in memory.
export function createGenerator({ seed, shipments, loggers, plan, mix = 'default' }) {
  const labels = resolvePlan({ seed, shipments, plan, mix });
  const N = labels.length;
  const nLoggers = loggers ?? Math.max(5, Math.ceil(N / 5));
  const master = generateMasterData(deriveRng(seed, 'master'), { loggers: nLoggers });
  const normal = master.logger.filter((l) => l.calibration_status === 'VALID');
  const lapsed = master.logger.filter((l) => l.calibration_status !== 'VALID');
  const L = normal.length, S = Math.ceil(N / L);
  const slotUnits = Math.floor(SPAN_UNITS / S);
  const windowUnits = slotUnits - GUARD_UNITS;
  if (windowUnits < 1) throw new Error('too many shipments per logger; increase --loggers');

  const base = (n, logger, P0, extra = {}) => buildBaseline({ rng: deriveRng(seed, n, 'base'), master, n, logger, P0, ...extra });
  const cellP0 = (n) => DEP_START + (Math.floor((n - 1) / L) * slotUnits + deriveRng(seed, n, 'slot').int(0, windowUnits)) * GRID;
  const cellLogger = (n) => normal[(n - 1) % L];
  const inject = (n) => deriveRng(seed, n, 'inject');

  // pairs: consecutive CROSS occurrences, first = A, second = B
  const crossIdx = labels.flatMap((l, i) => (l === CROSS ? [i + 1] : []));
  const partner = new Map();
  for (let i = 0; i < crossIdx.length; i += 2) partner.set(crossIdx[i], crossIdx[i + 1]);

  const lapsedBusy = new Map(lapsed.map((l) => [l.logger_id, []]));
  const meta = { seed, shipments: N, loggers: nLoggers, mix: Array.isArray(plan) ? 'custom' : mix };

  function* shipmentsIter() {
    const pending = new Map(); // partner shipments built early (B of a cross pair)
    for (let n = 1; n <= N; n++) {
      if (pending.has(n)) { const it = pending.get(n); pending.delete(n); yield { n, rows: it.built.rows, truth: it.truth }; continue; }
      const label = labels[n - 1];
      let built, truth;
      if (label === CROSS) {
        const nB = partner.get(n);
        const A = base(n, cellLogger(n), cellP0(n));
        const B = base(nB, A.info.logger, A.info.A + GRID, { product: A.info.product, fixedDeparture: true });
        const [tA, tB] = applyCrossPair(A, B, inject(n));
        built = A; truth = tA;
        pending.set(nB, { built: B, truth: tB });
      } else if (label === 'CALIBRATION_EXPIRED') {
        const r = deriveRng(seed, n, 'lapsed');
        for (let attempt = 0; attempt < 500 && !built; attempt++) {
          const l = lapsed[attempt % lapsed.length];
          const P0 = DEP_START + (MAR1_UNITS + r.int(0, SPAN_UNITS - MAR1_UNITS - GUARD_UNITS)) * GRID;
          const cand = base(n, l, P0);
          const s = cand.info.D - 30 * MIN, e = cand.info.A + 2 * HOUR; // held until arrival + 2h
          const busy = lapsedBusy.get(l.logger_id);
          if (busy.some(([x, y]) => s < y && x < e)) continue;
          busy.push([s, e]);
          built = cand;
        }
        if (!built) throw new Error('no free lapsed-logger interval');
        truth = applyInjector(label, built, inject(n), master);
      } else {
        built = base(n, cellLogger(n), cellP0(n));
        truth = applyInjector(label, built, inject(n), master);
      }
      yield { n, rows: built.rows, truth };
    }
  }
  return { meta, master, shipments: shipmentsIter };
}

// ---- in-memory dataset (tests, small runs) ----------------------------------------------------------------
export function generateDataset(opts) {
  const gen = createGenerator(opts);
  const tables = {};
  for (const t of parseSchema().order) tables[t] = [...(gen.master[t] ?? [])];
  const groundTruth = [];
  for (const { rows, truth } of gen.shipments()) {
    for (const t of Object.keys(rows)) for (const r of rows[t]) tables[t].push(r);
    groundTruth.push(truth);
  }
  return { tables, groundTruth, meta: gen.meta };
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const manifestOf = (meta, files) => ({ seed: meta.seed, shipments: meta.shipments, loggers: meta.loggers, mix: meta.mix,
  generator_version: generatorVersion(), files });

// filename -> content (including manifest.json). Byte-identical to the streaming writer's files.
export function renderFiles({ tables, groundTruth, meta }) {
  const files = {};
  for (const t of parseSchema().order) {
    const parts = [csvHeader(t)];
    for (const r of tables[t]) parts.push(csvLine(t, r));
    files[`${t}.csv`] = parts.join('');
  }
  files['ground_truth.csv'] = GT_HEADER + groundTruth.map(gtLine).join('');
  const mf = {};
  for (const [name, content] of Object.entries(files)) mf[name] = { rows: content.split('\n').length - 2, sha256: sha(content) };
  files['manifest.json'] = JSON.stringify(manifestOf(meta, mf), null, 2) + '\n';
  return files;
}

export function writeDataset(dataset, outDir) {
  mkdirSync(outDir, { recursive: true });
  const files = renderFiles(dataset);
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(outDir, name), content, 'utf8');
  return files;
}

// ---- streaming writer: rows go to disk as they are generated -----------------------------------------------
class FileSink {
  constructor(path) { this.stream = createWriteStream(path); this.hash = createHash('sha256'); this.parts = []; this.size = 0; this.rows = 0; }
  add(line, isRow = true) { this.parts.push(line); this.size += line.length; if (isRow) this.rows++; }
  async flush(force = false) {
    if (!force && this.size < (1 << 18)) return;
    if (!this.size) return;
    const chunk = this.parts.join('');
    this.parts = []; this.size = 0;
    this.hash.update(chunk);
    if (!this.stream.write(chunk)) await once(this.stream, 'drain'); // backpressure
  }
  async close() { await this.flush(true); this.stream.end(); await once(this.stream, 'finish'); return { rows: this.rows, sha256: this.hash.digest('hex') }; }
}

export async function writeDatasetStream(opts, outDir) {
  const gen = createGenerator(opts);
  mkdirSync(outDir, { recursive: true });
  const order = parseSchema().order;
  const sinks = {};
  for (const t of order) { sinks[t] = new FileSink(resolve(outDir, `${t}.csv`)); sinks[t].add(csvHeader(t), false); }
  const gt = new FileSink(resolve(outDir, 'ground_truth.csv'));
  gt.add(GT_HEADER, false);
  for (const t of order) for (const r of gen.master[t] ?? []) sinks[t].add(csvLine(t, r));
  for (const t of order) await sinks[t].flush();
  for (const { rows, truth } of gen.shipments()) {
    for (const t of Object.keys(rows)) for (const r of rows[t]) sinks[t].add(csvLine(t, r));
    gt.add(gtLine(truth));
    for (const t of order) await sinks[t].flush();
    await gt.flush();
  }
  const mf = {};
  for (const t of order) mf[`${t}.csv`] = await sinks[t].close();
  mf['ground_truth.csv'] = await gt.close();
  const manifest = manifestOf(gen.meta, mf);
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v];
  }));
  const t0 = performance.now();
  const seed = Number(args.seed ?? 20261022);
  const shipments = Number(args.shipments ?? 1);
  const loggers = args.loggers !== undefined ? Number(args.loggers) : undefined;
  const out = args.out ?? 'data/generated';
  const manifest = await writeDatasetStream({ seed, shipments, loggers, mix: args.mix ?? 'default' }, out);
  const rd = manifest.files['temperature_reading.csv'].rows;
  console.log(`generated seed=${seed} shipments=${manifest.shipments} loggers=${manifest.loggers} readings=${rd} -> ${out}`);
  console.log(JSON.stringify({ step: 'generate', elapsed_ms: Math.round(performance.now() - t0), peak_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024) }));
}
