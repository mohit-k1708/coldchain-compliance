// Exports a generated dataset as portable SQL (multi-row INSERTs in a transaction) or one JSON array file per table.
import { openSync, writeSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSchema } from '../generator/schema.js';
import { streamRows } from '../generator/csvStream.js';

const BATCH = 200;

function sqlValue(v, col) {
  if (v === null || v === undefined) return 'NULL';
  if (col.type === 'NUMERIC') return (Math.abs(v) < 5e-9 ? 0 : v).toFixed(col.scale);
  if (col.type === 'INTEGER') return String(v);
  if (col.type === 'BOOLEAN') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function exportSql(inDir, outFile) {
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  const fd = openSync(resolve(outFile), 'w');
  const w = (s) => writeSync(fd, s);
  const { order, tables } = parseSchema();
  const counts = {};
  w('-- Generated data (synthetic). Portable INSERTs for PostgreSQL and SQLite; load database/schema.sql first.\nBEGIN;\n');
  for (const t of order) {
    const file = resolve(inDir, `${t}.csv`);
    counts[t] = 0;
    if (!existsSync(file)) continue;
    const cols = tables[t].columns;
    const head = `INSERT INTO ${t} (${cols.map((c) => c.name).join(', ')}) VALUES\n`;
    let batch = [];
    const flush = () => { if (batch.length) { w(head + batch.join(',\n') + ';\n'); batch = []; } };
    counts[t] = streamRows(t, file, (r) => {
      batch.push(`(${cols.map((c) => sqlValue(r[c.name], c)).join(', ')})`);
      if (batch.length >= BATCH) flush();
    });
    flush();
  }
  w('COMMIT;\n');
  closeSync(fd);
  return counts;
}

export function exportJson(inDir, outDir) {
  mkdirSync(resolve(outDir), { recursive: true });
  const counts = {};
  for (const t of parseSchema().order) {
    const file = resolve(inDir, `${t}.csv`);
    if (!existsSync(file)) continue;
    const fd = openSync(resolve(outDir, `${t}.json`), 'w');
    writeSync(fd, '[');
    let first = true;
    counts[t] = streamRows(t, file, (r) => { writeSync(fd, (first ? '\n' : ',\n') + JSON.stringify(r)); first = false; });
    writeSync(fd, '\n]\n');
    closeSync(fd);
  }
  return counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const inDir = args.in ?? 'data/generated';
  const t0 = performance.now();
  const counts = args.format === 'json' ? exportJson(inDir, args.out ?? 'data/json') : exportSql(inDir, args.out ?? 'data/export.sql');
  console.log(`exported ${args.format} ${Object.values(counts).reduce((a, b) => a + b, 0)} rows in ${Math.round(performance.now() - t0)} ms`);
}
