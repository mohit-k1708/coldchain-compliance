// Typed CSV loader. Reads ONLY the 22 schema tables via an explicit whitelist.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { csvToRows } from '../generator/csv.js';

export const TABLES = Object.freeze([
  'party', 'product', 'lot', 'packaging', 'logger', 'logger_calibration', 'threshold_policy', 'shipment',
  'shipment_status_history', 'shipment_lot', 'shipment_packaging', 'logger_assignment', 'temperature_reading',
  'custody_event', 'route_stop', 'compliance_run', 'compliance_finding', 'compliance_evidence', 'excursion_report',
  'excursion_evidence', 'exception_event', 'legacy_report',
]);

export function loadTable(dir, name) {
  if (!TABLES.includes(name)) throw new Error(`loadTable: '${name}' is not a whitelisted schema table`);
  const f = resolve(dir, `${name}.csv`);
  return existsSync(f) ? csvToRows(name, readFileSync(f, 'utf8')) : [];
}

export function loadDataset(dir) {
  const ds = {};
  for (const t of TABLES) ds[t] = loadTable(dir, t);
  return ds;
}
