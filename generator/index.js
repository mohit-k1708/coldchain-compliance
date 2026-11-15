import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { deriveRng } from './prng.js';
import { parseSchema } from './schema.js';
import { tableToCsv } from './csv.js';
import { generateMasterData } from './masterData.js';
import { buildBaseline, DEP_START, SPAN_UNITS } from './shipmentGenerator.js';
import { applyInjector, applyCrossPair, makeTruth } from './injectors.js';
import { resolvePlan } from './plan.js';
import { GRID, MIN, HOUR, parse } from './time.js';
import * as ids from './ids.js';

const GT_COLUMNS = ['shipment_id', 'issue_type', 'variant', 'expected_decision', 'expected_evidence_category',
  'expected_rule', 'expected_excursion_minutes', 'expected_gap_minutes', 'related_shipment_id'];
const CROSS = 'CROSS_SHIPMENT_EXCURSION';
const MAR1_UNITS = (parse('2026-03-01T00:00:00Z') - DEP_START) / GRID;
const GUARD_UNITS = 8 * 144; // 8 days kept free at the end of every slot (room for a cross pair)

export function generateDataset({ seed, shipments, loggers, plan, mix = 'default' }) {
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

  // pairs: consecutive CROSS occurrences, first = A, second = B
  const crossIdx = labels.flatMap((l, i) => (l === CROSS ? [i + 1] : []));
  const partner = new Map();
  for (let i = 0; i < crossIdx.length; i += 2) { partner.set(crossIdx[i], crossIdx[i + 1]); }

  const built = new Map(), truth = new Map();
  const lapsedBusy = new Map(lapsed.map((l) => [l.logger_id, []]));
  const inject = (n) => deriveRng(seed, n, 'inject');

  for (let n = 1; n <= N; n++) {
    if (built.has(n)) continue;
    const label = labels[n - 1];
    if (label === CROSS) {
      const nB = partner.get(n);
      const A = base(n, cellLogger(n), cellP0(n));
      const B = base(nB, A.info.logger, A.info.A + GRID, { product: A.info.product, fixedDeparture: true });
      const [tA, tB] = applyCrossPair(A, B, inject(n));
      built.set(n, A); built.set(nB, B); truth.set(n, tA); truth.set(nB, tB);
    } else if (label === 'CALIBRATION_EXPIRED') {
      const r = deriveRng(seed, n, 'lapsed');
      let b = null;
      for (let attempt = 0; attempt < 500 && !b; attempt++) {
        const l = lapsed[attempt % lapsed.length];
        const P0 = DEP_START + (MAR1_UNITS + r.int(0, SPAN_UNITS - MAR1_UNITS - GUARD_UNITS)) * GRID;
        const cand = base(n, l, P0);
        const s = cand.info.D - 30 * MIN, e = cand.info.A + 2 * HOUR; // held until arrival + 2h
        const busy = lapsedBusy.get(l.logger_id);
        if (busy.some(([x, y]) => s < y && x < e)) continue;
        busy.push([s, e]);
        b = cand;
      }
      if (!b) throw new Error('no free lapsed-logger interval');
      built.set(n, b);
      truth.set(n, applyInjector(label, b, inject(n), master));
    } else {
      const b = base(n, cellLogger(n), cellP0(n));
      built.set(n, b);
      truth.set(n, applyInjector(label, b, inject(n), master));
    }
  }

  const tables = {};
  for (const t of parseSchema().order) tables[t] = [...(master[t] ?? [])];
  const groundTruth = [];
  for (let n = 1; n <= N; n++) {
    for (const t of Object.keys(built.get(n).rows)) tables[t].push(...built.get(n).rows[t]);
    groundTruth.push(truth.get(n));
  }
  return { tables, groundTruth, meta: { seed, shipments: N, loggers: nLoggers } };
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

// filename -> content (including manifest.json)
export function renderFiles({ tables, groundTruth, meta }) {
  const files = {};
  for (const t of parseSchema().order) files[`${t}.csv`] = tableToCsv(t, tables[t]);
  files['ground_truth.csv'] = [GT_COLUMNS.join(','), ...groundTruth.map((g) => GT_COLUMNS.map((c) => g[c] ?? '').join(','))].join('\n') + '\n';
  const manifest = { seed: meta.seed, shipments: meta.shipments, loggers: meta.loggers, files: {} };
  for (const [name, content] of Object.entries(files)) {
    manifest.files[name] = { rows: content.split('\n').length - 2, sha256: sha(content) };
  }
  files['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
  return files;
}

export function writeDataset(dataset, outDir) {
  mkdirSync(outDir, { recursive: true });
  const files = renderFiles(dataset);
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(outDir, name), content, 'utf8');
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v];
  }));
  const seed = Number(args.seed ?? 20261022);
  const shipments = Number(args.shipments ?? 1);
  const loggers = args.loggers !== undefined ? Number(args.loggers) : undefined;
  const out = args.out ?? 'data/generated';
  const mix = args.mix ?? 'default';
  const ds = generateDataset({ seed, shipments, loggers, mix });
  writeDataset(ds, out);
  console.log(`generated seed=${seed} shipments=${ds.meta.shipments} loggers=${ds.meta.loggers} readings=${ds.tables.temperature_reading.length} -> ${out}`);
}
