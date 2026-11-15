import { generateDataset } from '../../generator/index.js';
import { evaluateAll } from '../../engine/index.js';
import { openDb } from '../../server/db.js';
import { buildDb, tableSource } from '../../server/build.js';
import { createApp } from '../../server/app.js';

export const SEED = 20261022;

export function resultsTables(out) {
  return { compliance_run: out.runs, compliance_finding: out.findings, compliance_evidence: out.evidence, excursion_report: out.excursions, excursion_evidence: out.excursionEvidence };
}

// in-memory DB from an in-memory dataset + engine results
export function makeDb(opts = { seed: SEED, mix: 'each' }) {
  const ds = generateDataset(opts);
  const out = evaluateAll(ds.tables);
  const db = openDb(':memory:');
  const info = buildDb(db, { sources: [tableSource(ds.tables), tableSource(resultsTables(out))], seed: SEED });
  return { ds, out, db, info };
}

export async function startServer(db) {
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, role, raw } = {}) => {
    const headers = { ...(role ? { 'x-role': role } : {}), ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}) };
    const res = await fetch(base + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { base, call, get: (p, o) => call('GET', p, o), post: (p, body, role) => call('POST', p, { body, role }), close: () => new Promise((r) => server.close(r)) };
}
