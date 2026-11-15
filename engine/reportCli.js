// npm run report -- --shipment=SHP-2026-000123 [--format=md|html|json] [--in=data/generated] [--out=file]
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from './loadDataset.js';
import { ReadingStore } from './readingStore.js';
import { buildReport, renderMarkdown, renderHtml } from './report.js';
import { DEFAULT_AS_OF } from './index.js';
import { csvToRows } from '../generator/csv.js';

export function loadForReport(dir) {
  const tables = loadDataset(dir, { skip: ['temperature_reading'] });
  return { tables, readingStore: ReadingStore.load(resolve(dir, 'temperature_reading.csv')) };
}

export function render(report, format = 'md') {
  return format === 'json' ? JSON.stringify(report, null, 2) + '\n' : format === 'html' ? renderHtml(report) + '\n' : renderMarkdown(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  if (!args.shipment) { console.error('usage: npm run report -- --shipment=SHP-2026-000123 [--format=md|html|json] [--in=dir] [--out=file] [--results=dir]'); process.exit(2); }
  const { tables, readingStore } = loadForReport(args.in ?? 'data/generated');
  const resFile = resolve(args.results ?? 'data/results', 'compliance_run.csv');
  const priorRuns = existsSync(resFile) ? csvToRows('compliance_run', readFileSync(resFile, 'utf8')) : null;
  const text = render(buildReport(tables, args.shipment, { asOf: args['as-of'] ?? DEFAULT_AS_OF, readingStore, priorRuns }), args.format ?? 'md');
  if (args.out) writeFileSync(resolve(args.out), text, 'utf8'); else process.stdout.write(text);
}
