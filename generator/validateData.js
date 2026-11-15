import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSchema } from './schema.js';
import { csvToRows } from './csv.js';
import { parse, GRID } from './time.js';

export function validateDataset(tables) {
  const { order, tables: schema } = parseSchema();
  const errors = [];
  const err = (rule, table, id, msg) => errors.push({ rule, table, id, msg });
  const rows = (t) => tables[t] || [];
  const counts = {};
  for (const t of order) counts[t] = rows(t).length;
  const pkOf = (t, r) => schema[t].pk.map((c) => r[c]).join('|');

  // PK uniqueness
  for (const t of order) {
    const seen = new Set();
    for (const r of rows(t)) {
      const k = pkOf(t, r);
      if (seen.has(k)) err('PK_UNIQUE', t, k, 'duplicate primary key'); else seen.add(k);
    }
  }
  // FK integrity
  const keySets = {};
  const keys = (t, c) => (keySets[`${t}.${c}`] ??= new Set(rows(t).map((r) => r[c])));
  for (const t of order) {
    for (const fk of schema[t].fks) {
      const ref = keys(fk.table, fk.refCol);
      for (const r of rows(t)) {
        if (r[fk.col] !== null && r[fk.col] !== undefined && !ref.has(r[fk.col])) {
          err('FK_INTEGRITY', t, pkOf(t, r), `${fk.col}=${r[fk.col]} not in ${fk.table}.${fk.refCol}`);
        }
      }
    }
  }
  // Dates
  for (const s of rows('shipment')) {
    if (s.departure_time && s.arrival_time && parse(s.arrival_time) < parse(s.departure_time)) {
      err('DATE_ORDER', 'shipment', s.shipment_id, 'arrival_time < departure_time');
    }
  }
  // Readings: grid, duplicates, assignment window
  const assignById = new Map(rows('logger_assignment').map((a) => [a.logger_assignment_id, a]));
  const seenReading = new Set();
  for (const r of rows('temperature_reading')) {
    const t = parse(r.recorded_at);
    if (t % GRID !== 0) err('READING_GRID', 'temperature_reading', r.reading_id, 'recorded_at not on 10-minute grid');
    const k = `${r.logger_id}|${r.recorded_at}`;
    if (seenReading.has(k)) err('READING_DUP', 'temperature_reading', r.reading_id, 'duplicate (logger, recorded_at)');
    seenReading.add(k);
    if (r.logger_assignment_id) {
      const a = assignById.get(r.logger_assignment_id);
      if (a) {
        const to = a.assigned_to ? parse(a.assigned_to) : Infinity;
        if (a.logger_id !== r.logger_id || t < parse(a.assigned_from) || t > to) {
          err('READING_WINDOW', 'temperature_reading', r.reading_id, 'reading outside its assignment window/logger');
        }
      }
    }
  }
  // Assignment overlap per logger (cancelled ignored)
  const byLogger = new Map();
  for (const a of rows('logger_assignment')) {
    if (a.assignment_status === 'CANCELLED') continue;
    if (!byLogger.has(a.logger_id)) byLogger.set(a.logger_id, []);
    byLogger.get(a.logger_id).push(a);
  }
  for (const [lg, list] of byLogger) {
    list.sort((x, y) => parse(x.assigned_from) - parse(y.assigned_from));
    for (let i = 1; i < list.length; i++) {
      const prevTo = list[i - 1].assigned_to ? parse(list[i - 1].assigned_to) : Infinity;
      if (prevTo > parse(list[i].assigned_from)) {
        err('ASSIGNMENT_OVERLAP', 'logger_assignment', list[i].logger_assignment_id,
          `overlaps ${list[i - 1].logger_assignment_id} on ${lg}`);
      }
    }
  }
  // Custody chain
  const byShip = new Map();
  for (const c of rows('custody_event')) {
    if (!byShip.has(c.shipment_id)) byShip.set(c.shipment_id, []);
    byShip.get(c.shipment_id).push(c);
  }
  for (const [sid, list] of byShip) {
    list.sort((a, b) => a.event_sequence - b.event_sequence);
    if (list[0].event_type !== 'PICKUP') err('CUSTODY_CHAIN', 'custody_event', sid, 'first event is not PICKUP');
    if (list[list.length - 1].event_type !== 'DELIVERY') err('CUSTODY_CHAIN', 'custody_event', sid, 'last event is not DELIVERY');
    for (let i = 0; i < list.length; i++) {
      if (list[i].event_sequence !== i + 1) err('CUSTODY_CHAIN', 'custody_event', list[i].custody_event_id, 'sequence gap');
      if (i > 0) {
        if (list[i - 1].to_party_id !== list[i].from_party_id) {
          err('CUSTODY_CHAIN', 'custody_event', list[i].custody_event_id, 'from_party != previous to_party');
        }
        if (parse(list[i].event_timestamp) < parse(list[i - 1].event_timestamp)) {
          err('CUSTODY_CHAIN', 'custody_event', list[i].custody_event_id, 'timestamps out of order');
        }
      }
    }
  }
  // Lot/product match
  const shipById = new Map(rows('shipment').map((s) => [s.shipment_id, s]));
  const lotById = new Map(rows('lot').map((l) => [l.lot_id, l]));
  for (const sl of rows('shipment_lot')) {
    const s = shipById.get(sl.shipment_id), l = lotById.get(sl.lot_id);
    if (s && l && s.product_id !== l.product_id) {
      err('LOT_PRODUCT', 'shipment_lot', `${sl.shipment_id}|${sl.lot_id}`, 'lot product differs from shipment product');
    }
  }
  // Policy effective at departure
  const polById = new Map(rows('threshold_policy').map((p) => [p.policy_id, p]));
  for (const s of rows('shipment')) {
    const p = polById.get(s.policy_id);
    const dep = parse(s.departure_time || s.planned_departure);
    if (p && (p.product_id !== s.product_id || parse(p.effective_from) > dep
      || (p.effective_to && parse(p.effective_to) <= dep))) {
      err('POLICY_EFFECTIVE', 'shipment', s.shipment_id, 'policy not effective at departure / wrong product');
    }
  }

  const n = (rule) => errors.filter((e) => e.rule === rule).length;
  return {
    errors,
    summary: {
      counts,
      duplicatePKs: n('PK_UNIQUE'), invalidFKs: n('FK_INTEGRITY'), invalidDates: n('DATE_ORDER'),
      offGridReadings: n('READING_GRID'), duplicateReadings: n('READING_DUP'),
      readingsOutsideWindow: n('READING_WINDOW'), assignmentOverlaps: n('ASSIGNMENT_OVERLAP'),
      custodyBreaks: n('CUSTODY_CHAIN'), lotProductMismatches: n('LOT_PRODUCT'),
      policyNotEffective: n('POLICY_EFFECTIVE'), totalErrors: errors.length,
    },
  };
}

export function loadDir(dir) {
  const tables = {};
  for (const t of parseSchema().order) {
    const f = resolve(dir, `${t}.csv`);
    tables[t] = existsSync(f) ? csvToRows(t, readFileSync(f, 'utf8')) : [];
  }
  return tables;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((a) => a.startsWith('--dir='));
  const dir = arg ? arg.slice(6) : 'data/generated';
  const { errors, summary } = validateDataset(loadDir(dir));
  console.log(JSON.stringify(summary, null, 2));
  for (const e of errors.slice(0, 20)) console.log(`${e.rule} ${e.table} ${e.id}: ${e.msg}`);
  process.exit(errors.length ? 1 : 0);
}
