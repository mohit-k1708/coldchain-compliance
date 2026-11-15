import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRng } from './prng.js';
import { parseSchema } from './schema.js';
import { tableToCsv } from './csv.js';
import { generateMasterData } from './masterData.js';
import { createScheduler } from './scheduler.js';
import { buildNormalShipment } from './shipmentGenerator.js';
import * as ids from './ids.js';

const GT_HEADER = 'shipment_id,issue_type,expected_decision,expected_evidence_category,expected_rule';

export function generateDataset({ seed, shipments, loggers }) {
  const nLoggers = loggers ?? Math.max(5, Math.ceil(shipments / 5));
  const rng = createRng(seed);
  const master = generateMasterData(rng, { loggers: nLoggers });
  const counters = {};
  const ctx = {
    rng, master, scheduler: createScheduler(master.logger),
    id: (kind) => (counters[kind] = (counters[kind] ?? 0) + 1),
  };
  const tables = {};
  for (const t of parseSchema().order) tables[t] = [...(master[t] ?? [])];
  const groundTruth = [];
  for (let n = 1; n <= shipments; n++) {
    const built = buildNormalShipment(ctx, n);
    for (const t of Object.keys(built)) tables[t].push(...built[t]);
    groundTruth.push({ shipment_id: ids.shipmentId(n), issue_type: 'NONE', expected_decision: 'COMPLIANT',
      expected_evidence_category: 'NONE', expected_rule: 'ALL_RULES_PASS' });
  }
  return { tables, groundTruth, meta: { seed, shipments, loggers: nLoggers } };
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

// filename -> content (including manifest.json)
export function renderFiles({ tables, groundTruth, meta }) {
  const files = {};
  for (const t of parseSchema().order) files[`${t}.csv`] = tableToCsv(t, tables[t]);
  files['ground_truth.csv'] = [GT_HEADER, ...groundTruth.map((g) =>
    [g.shipment_id, g.issue_type, g.expected_decision, g.expected_evidence_category, g.expected_rule].join(','))].join('\n') + '\n';
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
  const ds = generateDataset({ seed, shipments, loggers });
  writeDataset(ds, out);
  console.log(`generated seed=${seed} shipments=${shipments} loggers=${ds.meta.loggers} readings=${ds.tables.temperature_reading.length} -> ${out}`);
}
