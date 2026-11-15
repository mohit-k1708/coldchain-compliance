import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSchema } from './schema.js';
import { csvToRows, parseCsv } from './csv.js';
import { ID_PATTERNS } from './idFormats.js';
import { parse, GRID, DAY, MIN } from './time.js';

// Integrity errors must be 0 on every dataset. Business observations are counted, NOT errors:
// they are the anomalies the compliance engine is supposed to find.
export function validateDataset(tables) {
  const { order, tables: schema } = parseSchema();
  const errors = [];
  const err = (rule, table, id, msg) => errors.push({ rule, table, id, msg });
  const rows = (t) => tables[t] || [];
  const counts = {};
  for (const t of order) counts[t] = rows(t).length;
  const pkOf = (t, r) => schema[t].pk.map((c) => r[c]).join('|');
  const T = (s) => parse(s);

  // --- integrity ---------------------------------------------------------------------------------------
  for (const t of order) {
    const seen = new Set();
    for (const r of rows(t)) {
      const k = pkOf(t, r);
      if (seen.has(k)) err('PK_UNIQUE', t, k, 'duplicate primary key'); else seen.add(k);
    }
  }
  const keySets = {};
  const keys = (t, c) => (keySets[`${t}.${c}`] ??= new Set(rows(t).map((r) => r[c])));
  for (const t of order) {
    for (const fk of schema[t].fks) {
      const ref = keys(fk.table, fk.refCol);
      for (const r of rows(t)) {
        const v = r[fk.col];
        if (v !== null && v !== undefined && !ref.has(v)) err('FK_INTEGRITY', t, pkOf(t, r), `${fk.col}=${v} not in ${fk.table}.${fk.refCol}`);
      }
    }
    for (const r of rows(t)) {
      for (const [col, allowed] of Object.entries(schema[t].enums)) {
        if (r[col] !== null && r[col] !== undefined && !allowed.includes(r[col])) err('ENUM', t, pkOf(t, r), `${col}=${r[col]}`);
      }
      const check = (col, pat) => {
        const v = r[col];
        if (pat && v !== null && v !== undefined && !pat.test(v)) err('ID_FORMAT', t, pkOf(t, r), `${col}=${v}`);
      };
      for (const c of schema[t].pk) check(c, ID_PATTERNS[c]);
      for (const fk of schema[t].fks) check(fk.col, ID_PATTERNS[fk.refCol]);
    }
  }
  const dateOrder = (t, r, id, a, b, strict = false) => {
    if (r[a] && r[b] && (strict ? T(r[b]) <= T(r[a]) : T(r[b]) < T(r[a]))) err('DATE_ORDER', t, id, `${b} before ${a}`);
  };
  for (const s of rows('shipment')) {
    dateOrder('shipment', s, s.shipment_id, 'departure_time', 'arrival_time');
    dateOrder('shipment', s, s.shipment_id, 'planned_departure', 'planned_arrival', true);
  }
  for (const a of rows('logger_assignment')) dateOrder('logger_assignment', a, a.logger_assignment_id, 'assigned_from', 'assigned_to');
  for (const c of rows('custody_event')) dateOrder('custody_event', c, c.custody_event_id, 'event_timestamp', 'recorded_at');
  for (const r of rows('route_stop')) {
    dateOrder('route_stop', r, r.route_stop_id, 'planned_arrival', 'planned_departure');
    dateOrder('route_stop', r, r.route_stop_id, 'actual_arrival', 'actual_departure');
  }
  const seenReading = new Set();
  for (const r of rows('temperature_reading')) {
    dateOrder('temperature_reading', r, r.reading_id, 'recorded_at', 'received_at');
    if (T(r.recorded_at) % GRID !== 0) err('READING_GRID', 'temperature_reading', r.reading_id, 'not on 10-minute grid');
    const k = `${r.logger_id}|${r.recorded_at}`;
    if (seenReading.has(k)) err('READING_DUP', 'temperature_reading', r.reading_id, 'duplicate (logger, recorded_at)');
    seenReading.add(k);
  }
  // reconcile excursion_report durations against their own times and evidence
  const evCount = new Map();
  for (const e of rows('excursion_evidence')) evCount.set(e.excursion_id, (evCount.get(e.excursion_id) ?? 0) + 1);
  for (const x of rows('excursion_report')) {
    dateOrder('excursion_report', x, x.excursion_id, 'start_time', 'end_time');
    if (x.start_time && x.end_time && x.duration_minutes !== (T(x.end_time) - T(x.start_time)) / MIN) {
      err('EXCURSION_DURATION', 'excursion_report', x.excursion_id, 'duration_minutes != end - start');
    }
    if (evCount.has(x.excursion_id) && x.duration_minutes !== evCount.get(x.excursion_id) * 10) {
      err('EXCURSION_DURATION', 'excursion_report', x.excursion_id, 'duration_minutes != 10 * evidence readings');
    }
  }

  // --- business observations (shipment-level sets) -------------------------------------------------------
  const obs = { assignmentOverlap: new Set(), noCoveringAssignment: new Set(), custodyDiscontinuity: new Set(),
    routeMismatch: new Set(), readingGap: new Set(), policyMismatch: new Set(), expiredCalibration: new Set() };
  const shipById = new Map(rows('shipment').map((s) => [s.shipment_id, s]));
  const polById = new Map(rows('threshold_policy').map((p) => [p.policy_id, p]));
  const assignById = new Map(rows('logger_assignment').map((a) => [a.logger_assignment_id, a]));
  const assignsByShip = new Map();
  for (const a of rows('logger_assignment')) {
    if (!assignsByShip.has(a.shipment_id)) assignsByShip.set(a.shipment_id, []);
    assignsByShip.get(a.shipment_id).push(a);
  }

  // assignment overlap per logger
  const byLogger = new Map();
  for (const a of rows('logger_assignment')) {
    if (a.assignment_status === 'CANCELLED') continue;
    if (!byLogger.has(a.logger_id)) byLogger.set(a.logger_id, []);
    byLogger.get(a.logger_id).push(a);
  }
  for (const list of byLogger.values()) {
    list.sort((x, y) => T(x.assigned_from) - T(y.assigned_from));
    for (let i = 1; i < list.length; i++) {
      const prevTo = list[i - 1].assigned_to ? T(list[i - 1].assigned_to) : Infinity;
      if (prevTo > T(list[i].assigned_from)) { obs.assignmentOverlap.add(list[i].shipment_id); obs.assignmentOverlap.add(list[i - 1].shipment_id); }
    }
  }
  // shipment without an assignment covering [departure, arrival]
  for (const s of rows('shipment')) {
    const dep = T(s.departure_time), arr = T(s.arrival_time);
    const ok = (assignsByShip.get(s.shipment_id) ?? []).some((a) => a.assignment_status !== 'CANCELLED'
      && T(a.assigned_from) <= dep && (a.assigned_to === null || T(a.assigned_to) >= arr));
    if (!ok) obs.noCoveringAssignment.add(s.shipment_id);
  }
  // readings outside / without assignment (count of readings)
  let readingsOutsideAssignment = 0;
  const readingsByAssign = new Map();
  for (const r of rows('temperature_reading')) {
    const a = r.logger_assignment_id ? assignById.get(r.logger_assignment_id) : null;
    const t = T(r.recorded_at);
    if (!a || a.logger_id !== r.logger_id || t < T(a.assigned_from) || (a.assigned_to && t > T(a.assigned_to))) readingsOutsideAssignment++;
    if (a) {
      if (!readingsByAssign.has(a.shipment_id)) readingsByAssign.set(a.shipment_id, []);
      readingsByAssign.get(a.shipment_id).push(t);
    }
  }
  // reading gaps > policy max_data_gap
  for (const [sid, times] of readingsByAssign) {
    const pol = polById.get(shipById.get(sid)?.policy_id);
    if (!pol) continue;
    times.sort((x, y) => x - y);
    for (let i = 1; i < times.length; i++) if ((times[i] - times[i - 1]) / MIN > pol.max_data_gap_minutes) obs.readingGap.add(sid);
  }
  // custody discontinuity
  const custByShip = new Map();
  for (const c of rows('custody_event')) {
    if (!custByShip.has(c.shipment_id)) custByShip.set(c.shipment_id, []);
    custByShip.get(c.shipment_id).push(c);
  }
  for (const s of rows('shipment')) {
    const ev = (custByShip.get(s.shipment_id) ?? []).sort((a, b) => a.event_sequence - b.event_sequence);
    let bad = ev.length === 0 || ev[0].event_type !== 'PICKUP' || ev.at(-1).event_type !== 'DELIVERY';
    ev.forEach((e, i) => {
      if (e.event_sequence !== i + 1 || !e.from_party_id || !e.to_party_id) bad = true;
      if (i > 0 && ev[i - 1].to_party_id !== e.from_party_id) bad = true;
    });
    if (bad) obs.custodyDiscontinuity.add(s.shipment_id);
  }
  // route mismatch
  const stopsByShip = new Map();
  for (const r of rows('route_stop')) {
    if (!stopsByShip.has(r.shipment_id)) stopsByShip.set(r.shipment_id, []);
    stopsByShip.get(r.shipment_id).push(r);
  }
  for (const [sid, stops] of stopsByShip) {
    const pol = polById.get(shipById.get(sid)?.policy_id);
    let bad = false;
    for (const st of stops) {
      if (st.stop_sequence !== null && st.actual_arrival === null) bad = true; // planned stop never reached
      if (st.stop_sequence === null) bad = true; // stop that was not planned
      if (pol && st.actual_arrival && st.actual_departure && (T(st.actual_departure) - T(st.actual_arrival)) / MIN > pol.max_dwell_minutes) bad = true;
    }
    const planned = stops.filter((s) => s.stop_sequence !== null && s.actual_sequence !== null).sort((a, b) => a.stop_sequence - b.stop_sequence);
    for (let i = 1; i < planned.length; i++) if (planned[i].actual_sequence < planned[i - 1].actual_sequence) bad = true;
    if (bad) obs.routeMismatch.add(sid);
  }
  // policy mismatch and expired calibration
  const calsByLogger = new Map();
  for (const c of rows('logger_calibration')) {
    if (!calsByLogger.has(c.logger_id)) calsByLogger.set(c.logger_id, []);
    calsByLogger.get(c.logger_id).push(c);
  }
  for (const s of rows('shipment')) {
    const p = polById.get(s.policy_id), dep = T(s.departure_time);
    if (!p || p.product_id !== s.product_id || T(p.effective_from) > dep || (p.effective_to && T(p.effective_to) <= dep)) obs.policyMismatch.add(s.shipment_id);
    for (const a of assignsByShip.get(s.shipment_id) ?? []) {
      const valid = (calsByLogger.get(a.logger_id) ?? []).some((c) => T(c.calibrated_on) <= dep && dep < T(c.expires_on) + DAY);
      if (!valid) obs.expiredCalibration.add(s.shipment_id);
    }
  }

  const n = (rule) => errors.filter((e) => e.rule === rule).length;
  const observations = Object.fromEntries(Object.entries(obs).map(([k, v]) => [k, [...v].sort()]));
  return {
    errors,
    observations,
    summary: {
      counts,
      integrity: {
        duplicatePKs: n('PK_UNIQUE'), invalidFKs: n('FK_INTEGRITY'), invalidEnums: n('ENUM'), badIdFormats: n('ID_FORMAT'),
        invalidDates: n('DATE_ORDER'), offGridReadings: n('READING_GRID'), duplicateReadings: n('READING_DUP'),
        excursionDurationMismatch: n('EXCURSION_DURATION'), totalErrors: errors.length,
      },
      observations: { ...Object.fromEntries(Object.entries(observations).map(([k, v]) => [k, v.length])), readingsOutsideAssignment },
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

// Observation -> ground-truth labels expected to produce it (used only by the CLI report below).
const OBS_LABELS = {
  assignmentOverlap: [], noCoveringAssignment: ['LOGGER_NOT_ASSIGNED'], custodyDiscontinuity: ['CUSTODY_GAP'],
  routeMismatch: ['ROUTE_DEVIATION'], readingGap: ['MISSING_DATA', 'MISSING_DATA_SILENTLY_PASSED'],
  policyMismatch: ['POLICY_MISMATCH'], expiredCalibration: ['CALIBRATION_EXPIRED'],
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find((a) => a.startsWith('--dir='));
  const dir = arg ? arg.slice(6) : 'data/generated';
  const { errors, observations, summary } = validateDataset(loadDir(dir));
  console.log('INTEGRITY', JSON.stringify(summary.integrity));
  for (const e of errors.slice(0, 20)) console.log(`  ${e.rule} ${e.table} ${e.id}: ${e.msg}`);
  const gtFile = resolve(dir, 'ground_truth.csv');
  const gt = existsSync(gtFile) ? parseCsv(readFileSync(gtFile, 'utf8')).slice(1).map((r) => ({ id: r[0], label: r[1] })) : [];
  console.log('BUSINESS OBSERVATIONS (shipments)  observed | ground-truth labels');
  for (const [k, labels] of Object.entries(OBS_LABELS)) {
    const truthIds = gt.filter((g) => labels.includes(g.label)).map((g) => g.id).sort();
    const same = JSON.stringify(truthIds) === JSON.stringify(observations[k]);
    console.log(`  ${k.padEnd(22)} ${String(observations[k].length).padStart(4)} | ${String(truthIds.length).padStart(4)}  ${labels.join('+') || '(none expected)'}  ${gt.length ? (same ? 'MATCH' : 'DIFF') : ''}`);
  }
  console.log(`  readingsOutsideAssignment (readings): ${summary.observations.readingsOutsideAssignment}`);
  if (gt.length) {
    const byLabel = {};
    for (const g of gt) byLabel[g.label] = (byLabel[g.label] ?? 0) + 1;
    console.log('GROUND TRUTH LABELS', JSON.stringify(byLabel));
  }
  process.exit(errors.length ? 1 : 0);
}
