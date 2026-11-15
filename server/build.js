// npm run db:build -- --in=data/generated --results=data/results --db=data/app.db
// Bulk-loads the generated dataset and the engine results into SQLite and seeds a deterministic investigation workflow.
import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, applySchema, all, run, tx, bool } from './db.js';
import { parseSchema } from '../generator/schema.js';
import { streamRows } from '../generator/csvStream.js';
import { createRng } from '../generator/prng.js';
import { applyTransition } from '../engine/exceptions.js';
import { ms, iso, HOUR } from '../engine/time.js';
import { recordPerf } from '../scripts/perfDoc.js';

// A source offers forEach(table, cb). CSV sources stream; table sources iterate arrays.
export const csvSource = (dir) => ({
  forEach(table, cb) { const f = resolve(dir, `${table}.csv`); return existsSync(f) ? streamRows(table, f, cb) : 0; },
});
export const tableSource = (tables) => ({
  forEach(table, cb) { const rows = tables[table] ?? []; for (const r of rows) cb(r); return rows.length; },
});

export function loadAll(db, sources) {
  const { order, tables } = parseSchema();
  const counts = {};
  for (const t of order) {
    const cols = tables[t].columns.map((c) => c.name);
    const ins = db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    counts[t] = 0;
    tx(db, () => {
      for (const src of sources) {
        src.forEach(t, (r) => { ins.run(...cols.map((c) => bool(r[c] === undefined ? null : r[c]))); counts[t]++; });
      }
    });
  }
  return counts;
}

const ANALYSTS = ['Alice Chen', 'Bob Singh', 'Carla Ortiz', 'Dmitri Volkov', 'Eun-ji Park'];
const NOTES = ['logger data reviewed', 'carrier contacted', 'root cause under review'];
const RESOLUTIONS = ['accepted after review', 'product quarantined and released after test', 'false alarm: calibration drift within tolerance'];

// ~40% of ENGINE exceptions progress; each step goes through applyTransition so every history row is legal.
export function seedWorkflow(db, seed = 20261022) {
  const rng = createRng(seed ^ 0x5eed);
  const ex = all(db, "SELECT * FROM excursion_report WHERE source = 'ENGINE' ORDER BY excursion_id");
  let n = 0, progressed = 0;
  const stats = { ASSIGNED: 0, INVESTIGATING: 0, RESOLVED: 0, ESCALATED: 0 };
  const insEv = db.prepare('INSERT INTO exception_event (exception_event_id, excursion_id, from_status, to_status, analyst, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const upd = db.prepare('UPDATE excursion_report SET status = ?, assigned_analyst = ?, resolution = ?, resolved_at = ? WHERE excursion_id = ?');
  tx(db, () => {
    for (const e of ex) {
      if (!rng.chance(0.4)) continue;
      progressed++;
      const r = rng.next();
      const target = r < 0.4 ? 'RESOLVED' : r < 0.5 ? 'ESCALATED' : r < 0.75 ? 'INVESTIGATING' : 'ASSIGNED';
      const analyst = rng.pick(ANALYSTS);
      let t = ms(e.detected_at);
      const at = () => { t += rng.int(1, 36) * HOUR; return iso(t); };
      const path = { ASSIGNED: ['ASSIGNED'], INVESTIGATING: ['ASSIGNED', 'INVESTIGATING'], RESOLVED: ['ASSIGNED', 'INVESTIGATING', 'RESOLVED'], ESCALATED: ['ASSIGNED', 'INVESTIGATING', 'ESCALATED'] }[target];
      let state = { exception: { ...e }, history: [] };
      for (const to of path) {
        n++;
        state = applyTransition(state.exception, state.history, {
          event_id: `EVT-2026-${String(n).padStart(6, '0')}`, to_status: to, occurred_at: at(),
          analyst: to === 'ASSIGNED' ? analyst : undefined,
          note: to === 'ESCALATED' ? rng.pick(NOTES) : to === 'INVESTIGATING' ? 'investigation started' : undefined,
          resolution: to === 'RESOLVED' ? rng.pick(RESOLUTIONS) : undefined,
        });
      }
      for (const h of state.history) insEv.run(h.exception_event_id, h.excursion_id, h.from_status, h.to_status, h.analyst, h.note, h.occurred_at);
      const x = state.exception;
      upd.run(x.status, x.assigned_analyst ?? null, x.resolution ?? null, x.resolved_at ?? null, x.excursion_id);
      stats[target]++;
    }
  });
  return { exceptions: ex.length, progressed, events: n, ...stats };
}

export function buildDb(db, { sources, seed }) {
  const t0 = performance.now();
  const idxSql = applySchema(db, { withIndexes: false });
  db.exec('PRAGMA foreign_keys=OFF');
  const counts = loadAll(db, sources);
  const tLoad = performance.now();
  for (const sql of idxSql) db.exec(sql);
  db.exec('PRAGMA foreign_keys=ON');
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) throw new Error(`foreign_key_check failed: ${fk.length} violation(s), first ${JSON.stringify(fk[0])}`);
  const workflow = seedWorkflow(db, seed);
  db.exec('ANALYZE');
  return { counts, workflow, load_ms: tLoad - t0, total_ms: performance.now() - t0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const inDir = args.in ?? 'data/generated', resDir = args.results ?? 'data/results', path = resolve(args.db ?? 'data/app.db');
  for (const ext of ['', '-wal', '-shm']) if (existsSync(path + ext)) rmSync(path + ext);
  const db = openDb(path);
  db.exec('PRAGMA synchronous=OFF');
  const r = buildDb(db, { sources: [csvSource(inDir), csvSource(resDir)], seed: 20261022 });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const rows = Object.values(r.counts).reduce((a, b) => a + b, 0);
  for (const [t, n] of Object.entries(r.counts)) if (n) console.log(`  ${t.padEnd(26)} ${String(n).padStart(9)}`);
  console.log(`workflow: ${r.workflow.progressed}/${r.workflow.exceptions} exceptions progressed (${r.workflow.events} events): ASSIGNED ${r.workflow.ASSIGNED}, INVESTIGATING ${r.workflow.INVESTIGATING}, RESOLVED ${r.workflow.RESOLVED}, ESCALATED ${r.workflow.ESCALATED}`);
  console.log(`loaded ${rows} rows in ${Math.round(r.load_ms)} ms (${Math.round(rows / (r.load_ms / 1000))} rows/s); total ${Math.round(r.total_ms)} ms; DB ${(statSync(path).size / 1048576).toFixed(1)} MB; foreign_key_check clean`);
  recordPerf('db_build', { measured_at: new Date().toISOString().slice(0, 10), rows, load_ms: Math.round(r.load_ms), total_ms: Math.round(r.total_ms), rows_per_s: Math.round(rows / (r.load_ms / 1000)),
    db_mb: Number((statSync(path).size / 1048576).toFixed(1)), peak_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024),
    workflow: `${r.workflow.progressed} of ${r.workflow.exceptions} engine exceptions progressed (ASSIGNED ${r.workflow.ASSIGNED}, INVESTIGATING ${r.workflow.INVESTIGATING}, RESOLVED ${r.workflow.RESOLVED}, ESCALATED ${r.workflow.ESCALATED}), every history row through applyTransition` });
  console.log(JSON.stringify({ step: 'db:build', elapsed_ms: Math.round(r.total_ms), rows, rows_per_s: Math.round(rows / (r.load_ms / 1000)), db_mb: Math.round(statSync(path).size / 1048576), peak_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024) }));
}
void run;
