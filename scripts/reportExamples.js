// Writes docs/examples/*.md from data/sample: one shipment per label (this script, not the engine, may read ground truth to pick them).
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadForReport } from '../engine/reportCli.js';
import { buildReport, renderMarkdown } from '../engine/report.js';
import { readTruth } from '../evaluation/cli.js';

const dir = resolve('data/sample'), outDir = resolve('docs/examples');
const LABELS = ['TEMPERATURE_EXCURSION', 'LOGGER_NOT_ASSIGNED', 'POLICY_MISMATCH', 'MISSING_DATA_SILENTLY_PASSED', 'CUSTODY_GAP', 'CROSS_SHIPMENT_EXCURSION', 'ROUTE_DEVIATION', 'NONE'];
const { tables, readingStore } = loadForReport(dir);
const truth = readTruth(resolve(dir, 'ground_truth.csv'));
mkdirSync(outDir, { recursive: true });
const index = ['# Example compliance reports', '', 'Generated from `data/sample` (seed 20261022, 100 shipments) by `npm run report:examples`. One shipment per scenario.', '',
  '| scenario | shipment | engine decision | root cause | report |', '|---|---|---|---|---|'];
for (const label of LABELS) {
  const g = truth.find((x) => x.issue_type === label && (label !== 'CROSS_SHIPMENT_EXCURSION' || x.variant === 'FIRST'));
  const rep = buildReport(tables, g.shipment_id, { readingStore });
  const file = `${label}-${g.shipment_id}.md`;
  writeFileSync(resolve(outDir, file), renderMarkdown(rep), 'utf8');
  index.push(`| ${label} | ${g.shipment_id} | ${rep.header.status} | ${rep.header.root_rule} | [${file}](${file}) |`);
}
writeFileSync(resolve(outDir, 'INDEX.md'), index.join('\n') + '\n', 'utf8');
console.log(`wrote ${LABELS.length} examples + INDEX.md to docs/examples`);
