// Times the main read endpoints against a built DB (3 runs each) and prints EXPLAIN QUERY PLAN for the heavy queries.
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { openDb, all, get } from '../server/db.js';
import { recordPerf } from './perfDoc.js';

const dbPath = resolve(process.env.DB_PATH ?? 'data/app.db');
const db = openDb(dbPath);
const server = createApp(db).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const sid = get(db, "SELECT s.shipment_id id FROM shipment s JOIN compliance_run r ON r.shipment_id = s.shipment_id AND r.is_current = 1 WHERE r.compliance_status = 'NON_COMPLIANT' ORDER BY s.shipment_id LIMIT 1 OFFSET 100").id;
const endpoints = [['GET /api/dashboard', '/api/dashboard'], ['GET /api/shipments?page=1', '/api/shipments?page=1'], ['GET /api/shipments?status=NON_COMPLIANT&pageSize=200', '/api/shipments?status=NON_COMPLIANT&pageSize=200'],
  [`GET /api/shipments/${sid}`, `/api/shipments/${sid}`], [`GET /api/shipments/${sid}/readings`, `/api/shipments/${sid}/readings`],
  [`GET /api/shipments/${sid}/report (json)`, `/api/shipments/${sid}/report`], [`GET /api/shipments/${sid}/report?format=html`, `/api/shipments/${sid}/report?format=html`],
  ['GET /api/exceptions?pageSize=50', '/api/exceptions?pageSize=50']];
const rows = [];
for (const [name, path] of endpoints) {
  const ms = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); const r = await fetch(base + path); await r.text(); if (!r.ok) throw new Error(`${path} -> ${r.status}`); ms.push(Math.round((performance.now() - t) * 10) / 10); }
  rows.push([name, ...ms]);
}
const plansOut = {};
console.log('| endpoint | run 1 (ms) | run 2 (ms) | run 3 (ms) |\n|---|---:|---:|---:|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const plans = {
  'shipments list': ["SELECT s.shipment_id FROM shipment s JOIN product p ON p.product_id = s.product_id LEFT JOIN compliance_run r ON r.shipment_id = s.shipment_id AND r.is_current = 1 WHERE r.compliance_status = 'NON_COMPLIANT' ORDER BY s.shipment_id LIMIT 25"],
  'readings window': ["SELECT * FROM temperature_reading WHERE logger_id = 'LGR-000001' AND recorded_at BETWEEN '2026-03-01T00:00:00Z' AND '2026-03-05T00:00:00Z' AND reading_quality = 'GOOD' ORDER BY recorded_at"],
  'dashboard top reasons': ["SELECT substr(reason_summary, instr(reason_summary, '['), 10) r, count(*) FROM compliance_run WHERE is_current = 1 GROUP BY r"],
  'findings of a run': ["SELECT * FROM compliance_finding WHERE compliance_run_id = 'RUN-2026-000001'"],
  'exceptions list': ["SELECT * FROM excursion_report WHERE source = 'ENGINE' AND status = 'OPEN' ORDER BY excursion_id LIMIT 50"],
};
for (const [name, [sql]] of Object.entries(plans)) {
  console.log(`\nEXPLAIN QUERY PLAN ${name}:`);
  plansOut[name] = all(db, `EXPLAIN QUERY PLAN ${sql}`).map((p) => p.detail);
  for (const p of plansOut[name]) console.log('  ', p);
}
recordPerf('api', { measured_at: new Date().toISOString().slice(0, 10), runs: 3, rows: rows.map(([name, ...ms]) => ({ name, ms })), plans: plansOut });
server.close();
